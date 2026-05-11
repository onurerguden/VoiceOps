from __future__ import annotations

import unicodedata
from datetime import date, datetime
from typing import Literal

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models import Customer, Order, OrderItem, Product, QueryLog, Stock


def normalize_text(value: str) -> str:
    lowered = value.lower().strip()
    replacements = {
        "ı": "i",
        "ğ": "g",
        "ü": "u",
        "ş": "s",
        "ö": "o",
        "ç": "c",
        "İ": "i",
    }
    for source, target in replacements.items():
        lowered = lowered.replace(source, target)
    return "".join(
        char for char in unicodedata.normalize("NFKD", lowered) if not unicodedata.combining(char)
    )


def product_to_payload(stock: Stock) -> dict:
    return {
        "product_id": stock.product.id,
        "product_name": stock.product.name,
        "unit": stock.product.unit,
        "category": stock.product.category,
        "quantity": round(stock.quantity, 2),
        "critical_threshold": round(stock.critical_threshold, 2),
        "is_critical": stock.quantity <= stock.critical_threshold,
        "updated_at": stock.updated_at.isoformat(),
    }


def order_to_payload(order: Order) -> dict:
    return {
        "id": order.id,
        "customer_name": order.customer.name,
        "status": order.status,
        "cargo_company": order.cargo_company,
        "tracking_no": order.tracking_no,
        "estimated_delivery": order.estimated_delivery.isoformat() if order.estimated_delivery else None,
        "created_at": order.created_at.isoformat(),
        "total_amount": round(order.total_amount, 2),
        "items": [
            {
                "product_name": item.product.name,
                "quantity": item.quantity,
                "unit": item.product.unit,
            }
            for item in order.items
        ],
    }


def find_product(db: Session, product_name: str) -> Product | None:
    needle = normalize_text(product_name)
    products = db.query(Product).options(joinedload(Product.stock)).all()
    for product in products:
        normalized_name = normalize_text(product.name)
        if normalized_name in needle or needle in normalized_name:
            return product
    return None


def get_order_status(db: Session, order_id: int) -> dict:
    order = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        return {"found": False, "message": f"{order_id} numarali siparis bulunamadi."}
    return {"found": True, "order": order_to_payload(order)}


def check_stock(db: Session, product_name: str) -> dict:
    product = find_product(db, product_name)
    if not product or not product.stock:
        return {"found": False, "message": f"{product_name} icin stok kaydi bulunamadi."}
    return {"found": True, "stock": product_to_payload(product.stock)}


def get_daily_summary(db: Session, target_date: str | None = None) -> dict:
    try:
        selected_date = date.fromisoformat(target_date) if target_date else date.today()
    except ValueError:
        selected_date = date.today()
    start = datetime.combine(selected_date, datetime.min.time())
    end = datetime.combine(selected_date, datetime.max.time())

    orders = db.query(Order).filter(Order.created_at >= start, Order.created_at <= end).all()
    status_counts: dict[str, int] = {}
    total_revenue = 0.0
    for order in orders:
        status_counts[order.status] = status_counts.get(order.status, 0) + 1
        total_revenue += order.total_amount

    return {
        "date": selected_date.isoformat(),
        "total_orders": len(orders),
        "status_counts": status_counts,
        "pending_count": status_counts.get("bekliyor", 0) + status_counts.get("hazırlanıyor", 0),
        "not_shipped_count": status_counts.get("bekliyor", 0) + status_counts.get("hazırlanıyor", 0),
        "total_revenue": round(total_revenue, 2),
    }


def get_critical_stock(db: Session) -> dict:
    stocks = (
        db.query(Stock)
        .options(joinedload(Stock.product))
        .join(Product)
        .filter(Stock.quantity <= Stock.critical_threshold)
        .order_by(Stock.quantity.asc())
        .all()
    )
    return {"count": len(stocks), "items": [product_to_payload(stock) for stock in stocks]}


def get_customer_info(db: Session, customer_name: str | None = None, order_id: int | None = None) -> dict:
    customer: Customer | None = None
    if order_id:
        order = db.query(Order).options(joinedload(Order.customer)).filter(Order.id == order_id).first()
        customer = order.customer if order else None
    elif customer_name:
        needle = normalize_text(customer_name)
        customers = db.query(Customer).all()
        for candidate in customers:
            normalized_name = normalize_text(candidate.name)
            if needle in normalized_name or normalized_name in needle:
                customer = candidate
                break

    if not customer:
        return {"found": False, "message": "Musteri kaydi bulunamadi."}

    latest_order = (
        db.query(Order)
        .filter(Order.customer_id == customer.id)
        .order_by(Order.created_at.desc())
        .first()
    )
    return {
        "found": True,
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "total_orders": customer.total_orders,
            "latest_order_id": latest_order.id if latest_order else None,
            "latest_order_status": latest_order.status if latest_order else None,
        },
    }


def list_pending_orders(db: Session, limit: int = 10) -> dict:
    orders = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .filter(or_(Order.status == "bekliyor", Order.status == "hazırlanıyor"))
        .order_by(Order.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"count": len(orders), "orders": [order_to_payload(order) for order in orders]}


def update_stock(
    db: Session,
    product_name: str,
    quantity: float,
    operation: Literal["add", "subtract", "set"] = "subtract",
) -> dict:
    if not product_name or quantity is None or quantity <= 0:
        return {
            "updated": False,
            "message": "Stok guncellemek icin urun adi ve sifirdan buyuk miktar gerekli.",
        }

    product = find_product(db, product_name)
    if not product or not product.stock:
        return {"updated": False, "message": f"{product_name} icin stok kaydi bulunamadi."}

    stock = product.stock
    previous_quantity = stock.quantity
    if operation == "add":
        stock.quantity += quantity
    elif operation == "set":
        stock.quantity = quantity
    else:
        if stock.quantity - quantity < 0:
            return {
                "updated": False,
                "message": f"{product.name} stogu yetersiz. Mevcut miktar {stock.quantity:.1f} {product.unit}.",
                "stock": product_to_payload(stock),
            }
        stock.quantity -= quantity

    stock.updated_at = datetime.utcnow()
    db.flush()
    return {
        "updated": True,
        "operation": operation,
        "previous_quantity": round(previous_quantity, 2),
        "changed_quantity": round(quantity, 2),
        "stock": product_to_payload(stock),
    }


def list_orders(db: Session, limit: int = 10) -> list[dict]:
    orders = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .order_by(Order.created_at.desc())
        .limit(limit)
        .all()
    )
    return [order_to_payload(order) for order in orders]


def list_stock(db: Session, critical_only: bool = False) -> list[dict]:
    query = db.query(Stock).options(joinedload(Stock.product)).join(Product)
    if critical_only:
        query = query.filter(Stock.quantity <= Stock.critical_threshold)
    stocks = query.order_by(Product.name.asc()).all()
    return [product_to_payload(stock) for stock in stocks]


def list_history(db: Session, limit: int = 10) -> list[dict]:
    rows = db.query(QueryLog).order_by(QueryLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": row.id,
            "user_query": row.user_query,
            "intent": row.intent,
            "ai_response": row.ai_response,
            "created_at": row.created_at,
            "response_time_ms": row.response_time_ms,
        }
        for row in rows
    ]
