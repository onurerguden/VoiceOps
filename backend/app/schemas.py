from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class QueryRequest(BaseModel):
    text: str = Field(..., min_length=1, examples=["Domatesten 5 kilo düş"])


class QueryResponse(BaseModel):
    transcript: str
    answer: str
    intent: str | None = None
    updated_stock: dict | None = None
    response_time_ms: int
    ok: bool = True


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    total_orders: int


class OrderItemOut(BaseModel):
    product_name: str
    quantity: float
    unit: str


class OrderOut(BaseModel):
    id: int
    customer_name: str
    status: str
    cargo_company: str | None
    tracking_no: str | None
    estimated_delivery: date | None
    created_at: datetime
    total_amount: float
    items: list[OrderItemOut]


class StockOut(BaseModel):
    product_id: int
    product_name: str
    unit: str
    category: str
    quantity: float
    critical_threshold: float
    is_critical: bool
    updated_at: datetime


class HistoryOut(BaseModel):
    id: int
    user_query: str
    intent: str | None
    ai_response: str
    created_at: datetime
    response_time_ms: int


class StockPatchRequest(BaseModel):
    operation: Literal["add", "subtract", "set"] = "subtract"
    quantity: float = Field(..., gt=0)
