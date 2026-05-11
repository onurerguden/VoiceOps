from __future__ import annotations

from contextlib import asynccontextmanager
from functools import lru_cache
from time import perf_counter

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db, init_db
from app.models import Product, QueryLog, Stock
from app.schemas import HistoryOut, OrderOut, QueryRequest, QueryResponse, StockOut, StockPatchRequest
from app.seed import seed_demo_data
from app.services.gemini_agent import AgentResult, GeminiAgent
from app.services.tools import list_history, list_orders, list_stock, product_to_payload, update_stock

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    from app.database import SessionLocal

    with SessionLocal() as db:
        seed_demo_data(db)
    yield


app = FastAPI(
    title="VoiceOps API",
    description="Turkce depo ici sesli operasyon asistani MVP API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def get_agent() -> GeminiAgent:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY eksik. Root .env dosyasina Gemini API key ekleyip backend'i yeniden baslatin.",
        )
    return GeminiAgent(settings=settings)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "voiceops-api", "model": settings.gemini_model}


@app.post("/api/query", response_model=QueryResponse)
def query_voiceops(
    request: QueryRequest,
    db: Session = Depends(get_db),
    agent: GeminiAgent = Depends(get_agent),
) -> QueryResponse:
    transcript = request.text.strip()
    started = perf_counter()
    try:
        result: AgentResult = agent.run(transcript, db)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini istegi basarisiz oldu. API key, kota veya internet erisimini kontrol edin. Detay: {exc}",
        ) from exc

    elapsed_ms = int((perf_counter() - started) * 1000)
    db.add(
        QueryLog(
            user_query=transcript,
            intent=result.intent,
            ai_response=result.answer,
            response_time_ms=elapsed_ms,
        )
    )
    db.commit()

    updated_stock = None
    if result.intent == "update_stock" and result.tool_result:
        updated_stock = result.tool_result.get("stock")

    return QueryResponse(
        transcript=transcript,
        answer=result.answer,
        intent=result.intent,
        updated_stock=updated_stock,
        response_time_ms=elapsed_ms,
    )


@app.get("/api/orders", response_model=list[OrderOut])
def get_orders(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[dict]:
    return list_orders(db, limit)


@app.get("/api/stock", response_model=list[StockOut])
def get_stock(
    critical_only: bool = False,
    db: Session = Depends(get_db),
) -> list[dict]:
    return list_stock(db, critical_only)


@app.get("/api/history", response_model=list[HistoryOut])
def get_history(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[dict]:
    return list_history(db, limit)


@app.patch("/api/stock/{product_id}", response_model=StockOut)
def patch_stock(
    product_id: int,
    request: StockPatchRequest,
    db: Session = Depends(get_db),
) -> dict:
    stock = db.query(Stock).filter(Stock.product_id == product_id).first()
    product = db.query(Product).filter(Product.id == product_id).first()
    if not stock or not product:
        raise HTTPException(status_code=404, detail="Urun veya stok kaydi bulunamadi.")

    result = update_stock(db, product.name, request.quantity, request.operation)
    if not result.get("updated"):
        raise HTTPException(status_code=400, detail=result.get("message", "Stok guncellenemedi."))
    db.commit()
    db.refresh(stock)
    return product_to_payload(stock)
