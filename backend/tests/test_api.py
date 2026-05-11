from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import create_app, get_agent
from app.seed import seed_demo_data
from app.services import tools as db_tools
from app.services.gemini_agent import AgentResult


class FakeAgent:
    def run(self, text, db):
        lowered = text.lower()
        if "müşteri" in lowered or "musteri" in lowered:
            result = db_tools.get_customer_info(db, order_id=105)
            return AgentResult("Siparisin musterisi Ahmet Yilmaz.", "get_customer_info", result)
        if "105" in lowered:
            result = db_tools.get_order_status(db, 105)
            return AgentResult("105 numarali siparis kargoda, takip numarasi hazir.", "get_order_status", result)
        if "domates" in lowered and ("düş" in lowered or "dus" in lowered):
            result = db_tools.update_stock(db, "Domates", 5, "subtract")
            return AgentResult("Domates stoktan 5 kilo dusuldu.", "update_stock", result)
        if "domates" in lowered:
            result = db_tools.check_stock(db, "Domates")
            return AgentResult("Domates stokta 32 kilo, kritik esigin altinda.", "check_stock", result)
        if "bugün" in lowered or "bugun" in lowered:
            result = db_tools.get_daily_summary(db)
            return AgentResult("Bugunku siparis ozeti hazir.", "get_daily_summary", result)
        if "kritik" in lowered:
            result = db_tools.get_critical_stock(db)
            return AgentResult("Kritik stok listesi hazir.", "get_critical_stock", result)
        if "müşteri" in lowered or "musteri" in lowered:
            result = db_tools.get_customer_info(db, order_id=105)
            return AgentResult("Siparisin musterisi Ahmet Yilmaz.", "get_customer_info", result)
        if "bekleyen" in lowered:
            result = db_tools.list_pending_orders(db)
            return AgentResult("Bekleyen siparisler listelendi.", "list_pending_orders", result)
        return AgentResult("Bu islem icin urun ve miktar gerekli.", None, None)


@pytest.fixture()
def db_session_factory(tmp_path: Path):
    db_path = tmp_path / "voiceops_test.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as db:
        seed_demo_data(db)

    yield TestingSessionLocal

    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session_factory):
    test_app = create_app(seed_on_startup=False)

    def override_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    test_app.dependency_overrides[get_db] = override_db
    test_app.dependency_overrides[get_agent] = lambda: FakeAgent()

    with TestClient(test_app) as test_client:
        yield test_client

    test_app.dependency_overrides.clear()


def test_seed_counts(client):
    orders = client.get("/api/orders?limit=50").json()
    stock = client.get("/api/stock").json()

    assert len(orders) == 30
    assert len(stock) == 25


def test_order_status_query_logs_history(client):
    response = client.post("/api/query", json={"text": "105 numarali siparis nerede?"})

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "get_order_status"
    assert "105" in body["answer"]

    history = client.get("/api/history").json()
    assert history[0]["intent"] == "get_order_status"


def test_stock_check_query(client):
    response = client.post("/api/query", json={"text": "Domatesten kac kilo kaldi?"})

    assert response.status_code == 200
    assert response.json()["intent"] == "check_stock"


def test_stock_update_decreases_quantity_and_logs(client):
    before = client.get("/api/stock").json()
    domates_before = next(row for row in before if row["product_name"] == "Domates")

    response = client.post("/api/query", json={"text": "Domatesten 5 kilo dus"})

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "update_stock"
    assert body["updated_stock"]["quantity"] == domates_before["quantity"] - 5

    after = client.get("/api/stock").json()
    domates_after = next(row for row in after if row["product_name"] == "Domates")
    assert domates_after["quantity"] == domates_before["quantity"] - 5


def test_summary_critical_customer_and_pending_queries(client):
    prompts = [
        ("Bugun kac siparis geldi?", "get_daily_summary"),
        ("Kritik stokta ne var?", "get_critical_stock"),
        ("105 numarali siparisin musteri bilgisi nedir?", "get_customer_info"),
        ("Bekleyen siparisler hangileri?", "list_pending_orders"),
    ]

    for prompt, intent in prompts:
        response = client.post("/api/query", json={"text": prompt})
        assert response.status_code == 200
        assert response.json()["intent"] == intent


def test_missing_parameters_do_not_update_stock(client):
    before = client.get("/api/stock").json()

    response = client.post("/api/query", json={"text": "Stoktan dus"})

    assert response.status_code == 200
    assert response.json()["intent"] is None
    assert client.get("/api/stock").json() == before


def test_empty_product_and_customer_names_do_not_match_first_records(db_session_factory):
    with db_session_factory() as db:
        domates_before = db_tools.check_stock(db, "Domates")["stock"]["quantity"]

        assert db_tools.check_stock(db, "")["found"] is False
        assert db_tools.check_stock(db, "   ")["found"] is False
        assert db_tools.get_customer_info(db, customer_name="   ")["found"] is False

        update_result = db_tools.update_stock(db, "", 5, "subtract")
        domates_after = db_tools.check_stock(db, "Domates")["stock"]["quantity"]

        assert update_result["updated"] is False
        assert domates_after == domates_before
