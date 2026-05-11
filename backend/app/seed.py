from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
from random import Random

from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models import Customer, Order, OrderItem, Product, Stock


CUSTOMERS = [
    ("Ahmet Yilmaz", "0532 111 22 33"),
    ("Zeynep Kaya", "0533 222 33 44"),
    ("Murat Demir", "0534 333 44 55"),
    ("Elif Sahin", "0535 444 55 66"),
    ("Mehmet Celik", "0536 555 66 77"),
    ("Ayse Arslan", "0537 666 77 88"),
    ("Can Koc", "0538 777 88 99"),
    ("Derya Aydin", "0539 888 99 00"),
    ("Selin Yildiz", "0541 123 45 67"),
    ("Kerem Ozkan", "0542 234 56 78"),
]

PRODUCTS = [
    ("Domates", "kg", 28.5, "sebze", 32, 40),
    ("Biber", "kg", 42.0, "sebze", 18, 20),
    ("Patlican", "kg", 36.0, "sebze", 55, 25),
    ("Salatalik", "kg", 24.0, "sebze", 76, 30),
    ("Patates", "kg", 18.0, "sebze", 180, 60),
    ("Sogan", "kg", 16.5, "sebze", 145, 50),
    ("Havuc", "kg", 21.0, "sebze", 64, 25),
    ("Marul", "adet", 14.0, "sebze", 22, 25),
    ("Elma", "kg", 34.0, "meyve", 88, 35),
    ("Muz", "kg", 58.0, "meyve", 26, 30),
    ("Portakal", "kg", 31.0, "meyve", 73, 30),
    ("Limon", "kg", 39.0, "meyve", 19, 20),
    ("Pirinç", "kg", 48.0, "tahil", 120, 35),
    ("Bulgur", "kg", 29.0, "tahil", 95, 30),
    ("Mercimek", "kg", 46.0, "bakliyat", 62, 25),
    ("Nohut", "kg", 52.0, "bakliyat", 44, 25),
    ("Makarna", "kutu", 18.0, "paketli", 130, 40),
    ("Un", "kg", 22.0, "paketli", 210, 70),
    ("Seker", "kg", 31.0, "paketli", 90, 35),
    ("Zeytinyagi", "litre", 185.0, "yag", 28, 15),
    ("Sut", "kutu", 25.0, "sut urunu", 66, 25),
    ("Yumurta", "adet", 4.2, "sut urunu", 240, 80),
    ("Peynir", "kg", 165.0, "sut urunu", 14, 15),
    ("Yogurt", "kutu", 38.0, "sut urunu", 12, 15),
    ("Tavuk Gogsu", "kg", 125.0, "et", 24, 20),
]


def reset_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_demo_data(db)


def seed_demo_data(db: Session) -> None:
    if db.query(Product).first():
        return

    customers = [Customer(name=name, phone=phone, total_orders=0) for name, phone in CUSTOMERS]
    db.add_all(customers)
    db.flush()

    products: list[Product] = []
    for name, unit, price, category, quantity, threshold in PRODUCTS:
        product = Product(name=name, unit=unit, price_per_unit=price, category=category)
        db.add(product)
        products.append(product)
        db.flush()
        db.add(Stock(product_id=product.id, quantity=quantity, critical_threshold=threshold))

    rng = Random(42)
    statuses = ["bekliyor", "hazırlanıyor", "kargoda", "teslim edildi"]
    cargo_companies = ["Yurtici", "Aras", "PTT", "MNG"]
    today = date.today()

    for index, order_id in enumerate(range(101, 131)):
        customer = customers[index % len(customers)]
        status = "kargoda" if order_id == 105 else statuses[index % len(statuses)]
        created_at = datetime.combine(today - timedelta(days=index % 5), datetime.min.time()).replace(
            hour=9 + (index % 9),
            minute=(index * 7) % 60,
        )
        estimated_delivery = today + timedelta(days=1 + (index % 3)) if status in {"kargoda", "hazırlanıyor"} else None
        cargo_company = cargo_companies[index % len(cargo_companies)] if status in {"kargoda", "teslim edildi"} else None
        tracking_no = f"VO-{2026}-{order_id:05d}" if cargo_company else None

        chosen_products = rng.sample(products, k=2 + (index % 2))
        total_amount = 0.0
        order = Order(
            id=order_id,
            customer_id=customer.id,
            status=status,
            cargo_company=cargo_company,
            tracking_no=tracking_no,
            estimated_delivery=estimated_delivery,
            created_at=created_at,
            total_amount=0,
        )
        db.add(order)
        db.flush()

        for product in chosen_products:
            quantity = float(rng.randint(2, 12))
            total_amount += quantity * product.price_per_unit
            db.add(OrderItem(order_id=order.id, product_id=product.id, quantity=quantity))

        order.total_amount = round(total_amount, 2)
        customer.total_orders += 1

    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="VoiceOps demo database seed/reset command")
    parser.add_argument("--reset", action="store_true", help="Drop all tables and recreate deterministic demo data")
    args = parser.parse_args()

    if args.reset:
        reset_database()
        print("VoiceOps demo verisi sifirlandi: 30 siparis, 25 urun.")
        return

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_demo_data(db)
    print("VoiceOps demo verisi hazir.")


if __name__ == "__main__":
    main()
