from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app.config import Settings
from app.services import tools as db_tools


SYSTEM_INSTRUCTION = """
Sen VoiceOps adli Turkce bir depo operasyon asistanisin.
Kullanici depo icinde sesli komut verir. Amacin niyeti anlamak, uygun araci cagirmak
ve sonucu kisa, net, operasyon dilinde Turkce yanitlamaktir.

Kurallar:
- Bilgi gerekiyorsa mutlaka verilen function tool'larini kullan.
- Stok guncelleme komutunda urun ve miktar netse update_stock aracini cagir.
- Stok guncellemede miktar veya urun eksikse araci cagirma; eksik bilgiyi tek cumleyle sor.
- Cevaplar 1-2 cumle olsun, demo sirasinda sesli okunacak kadar kisa kalsin.
- DB sonucunda bulunamadi veya yetersiz stok varsa bunu acikca soyle.
- Para birimi gerekiyorsa TL kullan.
""".strip()


@dataclass
class AgentResult:
    answer: str
    intent: str | None
    tool_result: dict | None = None


def _schema_object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required or []}


FUNCTION_DECLARATIONS = [
    types.FunctionDeclaration(
        name="get_order_status",
        description="Siparis numarasina gore siparis durumunu, kargo bilgisini ve kalemlerini getirir.",
        parameters=_schema_object(
            {"order_id": {"type": "integer", "description": "Siparis numarasi, ornek: 105"}},
            ["order_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="check_stock",
        description="Urun adina gore mevcut stok miktarini ve kritik stok durumunu getirir.",
        parameters=_schema_object(
            {"product_name": {"type": "string", "description": "Urun adi, ornek: Domates"}},
            ["product_name"],
        ),
    ),
    types.FunctionDeclaration(
        name="get_daily_summary",
        description="Belirli gunun siparis ozetini verir. Tarih yoksa bugunu kullanir.",
        parameters=_schema_object(
            {"target_date": {"type": "string", "description": "ISO tarih, ornek: 2026-05-11"}},
            [],
        ),
    ),
    types.FunctionDeclaration(
        name="get_critical_stock",
        description="Kritik esigin altinda veya esikte olan stok urunlerini listeler.",
        parameters=_schema_object({}, []),
    ),
    types.FunctionDeclaration(
        name="get_customer_info",
        description="Musteri adina veya siparis numarasina gore musteri bilgisini getirir.",
        parameters=_schema_object(
            {
                "customer_name": {"type": "string", "description": "Musteri adi"},
                "order_id": {"type": "integer", "description": "Siparis numarasi"},
            },
            [],
        ),
    ),
    types.FunctionDeclaration(
        name="list_pending_orders",
        description="Bekleyen veya hazırlanıyor durumundaki siparişleri listeler.",
        parameters=_schema_object(
            {"limit": {"type": "integer", "description": "Dondurulecek maksimum siparis sayisi"}},
            [],
        ),
    ),
    types.FunctionDeclaration(
        name="update_stock",
        description="Bir urunun stok miktarini ekler, azaltir veya dogrudan ayarlar.",
        parameters=_schema_object(
            {
                "product_name": {"type": "string", "description": "Urun adi, ornek: Domates"},
                "quantity": {"type": "number", "description": "Pozitif miktar"},
                "operation": {
                    "type": "string",
                    "enum": ["add", "subtract", "set"],
                    "description": "add: ekle, subtract: stoktan dus, set: miktari ayarla",
                },
            },
            ["product_name", "quantity", "operation"],
        ),
    ),
]


class GeminiAgent:
    def __init__(self, settings: Settings, client: genai.Client | None = None):
        self.settings = settings
        self.client = client or genai.Client(api_key=settings.gemini_api_key)
        self.config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            tools=[types.Tool(function_declarations=FUNCTION_DECLARATIONS)],
            temperature=0.2,
        )

    def run(self, text: str, db: Session) -> AgentResult:
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(
                        text=(
                            "Kullanici sesli komutu: "
                            f"{text}\n"
                            "Bu komutu depo operasyonu icin isle."
                        )
                    )
                ],
            )
        ]

        first_response = self.client.models.generate_content(
            model=self.settings.gemini_model,
            contents=contents,
            config=self.config,
        )
        tool_call = self._extract_function_call(first_response)

        if not tool_call:
            return AgentResult(answer=(first_response.text or "Bu komutu anlayamadim, tekrar dener misiniz?"), intent=None)

        tool_name = tool_call.name
        args = dict(tool_call.args or {})
        tool_result = self._execute_tool(db, tool_name, args)

        contents.append(first_response.candidates[0].content)
        contents.append(
            types.Content(
                role="user",
                parts=[
                    types.Part.from_function_response(
                        name=tool_name,
                        response={"result": tool_result},
                    )
                ],
            )
        )
        final_response = self.client.models.generate_content(
            model=self.settings.gemini_model,
            contents=contents,
            config=self.config,
        )
        answer = final_response.text or self._fallback_tool_answer(tool_name, tool_result)
        return AgentResult(answer=answer.strip(), intent=tool_name, tool_result=tool_result)

    @staticmethod
    def _extract_function_call(response: Any) -> Any | None:
        function_calls = getattr(response, "function_calls", None)
        if function_calls:
            return function_calls[0]

        for candidate in getattr(response, "candidates", []) or []:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", []) or []:
                function_call = getattr(part, "function_call", None)
                if function_call:
                    return function_call
        return None

    @staticmethod
    def _execute_tool(db: Session, tool_name: str, args: dict[str, Any]) -> dict:
        if tool_name == "get_order_status":
            return db_tools.get_order_status(db, int(args["order_id"]))
        if tool_name == "check_stock":
            return db_tools.check_stock(db, str(args["product_name"]))
        if tool_name == "get_daily_summary":
            return db_tools.get_daily_summary(db, args.get("target_date"))
        if tool_name == "get_critical_stock":
            return db_tools.get_critical_stock(db)
        if tool_name == "get_customer_info":
            order_id = args.get("order_id")
            return db_tools.get_customer_info(
                db,
                customer_name=args.get("customer_name"),
                order_id=int(order_id) if order_id else None,
            )
        if tool_name == "list_pending_orders":
            return db_tools.list_pending_orders(db, int(args.get("limit") or 10))
        if tool_name == "update_stock":
            return db_tools.update_stock(
                db,
                product_name=str(args["product_name"]),
                quantity=float(args["quantity"]),
                operation=args.get("operation") or "subtract",
            )
        return {"error": f"Bilinmeyen tool: {tool_name}"}

    @staticmethod
    def _fallback_tool_answer(tool_name: str, tool_result: dict) -> str:
        if tool_name == "update_stock" and tool_result.get("updated"):
            stock = tool_result["stock"]
            return f"{stock['product_name']} stogu guncellendi. Yeni miktar {stock['quantity']} {stock['unit']}."
        return "Islem tamamlandi."
