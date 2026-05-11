import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  Mic,
  MicOff,
  PackageCheck,
  Send,
  Volume2,
  Warehouse,
} from "lucide-react";
import { api, HistoryItem, Order, QueryResponse, Stock } from "./api";

type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

const statusCopy: Record<VoiceState, string> = {
  idle: "Hazır",
  listening: "Dinliyor",
  processing: "İşleniyor",
  speaking: "Konuşuyor",
  error: "Hata",
};

const demoPrompts = [
  "105 numaralı sipariş nerede?",
  "Domatesten kaç kilo kaldı?",
  "Domatesten 5 kilo düş",
  "Bugün kaç sipariş geldi?",
  "Kritik stokta ne var?",
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value);
}

function statusClass(status: string) {
  if (status === "teslim edildi") return "bg-emerald-100 text-emerald-800";
  if (status === "kargoda") return "bg-sky-100 text-sky-800";
  if (status === "hazırlanıyor") return "bg-amber-100 text-amber-800";
  return "bg-stone-200 text-stone-800";
}

function intentLabel(intent: string | null) {
  const labels: Record<string, string> = {
    get_order_status: "Sipariş",
    check_stock: "Stok",
    get_daily_summary: "Özet",
    get_critical_stock: "Kritik",
    get_customer_info: "Müşteri",
    list_pending_orders: "Bekleyen",
    update_stock: "Güncelleme",
  };
  return intent ? labels[intent] ?? intent : "Belirsiz";
}

export default function App() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [manualText, setManualText] = useState("");
  const [lastResponse, setLastResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const criticalStock = useMemo(() => stock.filter((item) => item.is_critical), [stock]);

  const refreshDashboard = useCallback(async () => {
    const [ordersData, stockData, historyData] = await Promise.all([
      api.orders(10),
      api.stock(false),
      api.history(10),
    ]);
    setOrders(ordersData);
    setStock(stockData);
    setHistory(historyData);
  }, []);

  useEffect(() => {
    refreshDashboard().catch((err: Error) => setError(err.message));
  }, [refreshDashboard]);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) {
      setVoiceState("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "tr-TR";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => setVoiceState("idle");
    utterance.onerror = () => setVoiceState("idle");
    window.speechSynthesis.speak(utterance);
  }, []);

  const submitQuery = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setError(null);
      setVoiceState("processing");
      try {
        const response = await api.query(trimmed);
        setLastResponse(response);
        setManualText("");
        await refreshDashboard();
        speak(response.answer);
      } catch (err) {
        const message = err instanceof Error ? err.message : "İşlem tamamlanamadı.";
        setError(message);
        setVoiceState("error");
      }
    },
    [refreshDashboard, speak]
  );

  const startListening = useCallback(() => {
    const SpeechRecognitionApi = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionApi) {
      setError("Bu tarayıcı Web Speech API desteklemiyor. Metin girişini kullanabilirsiniz.");
      setVoiceState("error");
      return;
    }

    window.speechSynthesis?.cancel();
    recognitionRef.current?.abort();

    const recognition = new SpeechRecognitionApi();
    recognition.lang = "tr-TR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setError(null);
      setVoiceState("listening");
    };
    recognition.onerror = (event) => {
      setError(event.message || `Ses algılama hatası: ${event.error}`);
      setVoiceState("error");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceState((current) => (current === "listening" ? "idle" : current));
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setManualText(transcript);
      void submitQuery(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [submitQuery]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setVoiceState("idle");
  }, []);

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitQuery(manualText);
  };

  const isBusy = voiceState === "listening" || voiceState === "processing" || voiceState === "speaking";

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-stone-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-300 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded bg-emerald-700 text-white">
              <Warehouse size={24} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">VoiceOps</h1>
              <p className="text-sm text-stone-600">Depo içi sesli operasyon asistanı</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-dot status-${voiceState}`} />
            <span className="text-sm font-medium text-stone-700">{statusCopy[voiceState]}</span>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(310px,380px)_1fr]">
          <div className="flex flex-col gap-4 rounded border border-stone-300 bg-white p-4 shadow-panel">
            <button
              type="button"
              onClick={voiceState === "listening" ? stopListening : startListening}
              className={`mic-button ${voiceState === "listening" ? "is-listening" : ""}`}
              aria-label={voiceState === "listening" ? "Dinlemeyi durdur" : "Mikrofonu başlat"}
              title={voiceState === "listening" ? "Dinlemeyi durdur" : "Mikrofonu başlat"}
            >
              {voiceState === "listening" ? <MicOff size={44} /> : <Mic size={44} />}
            </button>

            <div className="rounded border border-stone-200 bg-stone-50 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-stone-500">
                <Volume2 size={15} aria-hidden="true" />
                Son Yanıt
              </div>
              <p className="min-h-16 text-base font-medium leading-7 text-stone-900">
                {lastResponse?.answer ?? "Sesli komut bekleniyor."}
              </p>
              {lastResponse && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                  <span className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-800">
                    {intentLabel(lastResponse.intent)}
                  </span>
                  <span className="rounded bg-stone-200 px-2 py-1">{lastResponse.response_time_ms} ms</span>
                </div>
              )}
            </div>

            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                placeholder="Komut yazın"
              />
              <button
                type="submit"
                disabled={!manualText.trim() || isBusy}
                className="grid h-10 w-10 place-items-center rounded bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                aria-label="Komutu gönder"
                title="Komutu gönder"
              >
                {voiceState === "processing" ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              </button>
            </form>

            <div className="grid grid-cols-1 gap-2">
              {demoPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitQuery(prompt)}
                  disabled={isBusy}
                  className="rounded border border-stone-300 px-3 py-2 text-left text-sm font-medium text-stone-700 transition hover:border-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {error && (
              <div className="flex gap-2 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded border border-stone-300 bg-white p-4 shadow-panel">
              <PanelTitle icon={<ClipboardList size={18} />} title="Son Siparişler" count={orders.length} />
              <div className="mt-3 overflow-hidden rounded border border-stone-200">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="bg-stone-100 text-xs uppercase text-stone-500">
                    <tr>
                      <th className="w-20 px-3 py-2">No</th>
                      <th className="px-3 py-2">Müşteri</th>
                      <th className="w-32 px-3 py-2">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-3 py-3 font-semibold">#{order.id}</td>
                        <td className="truncate px-3 py-3">{order.customer_name}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded border border-stone-300 bg-white p-4 shadow-panel">
              <PanelTitle icon={<AlertTriangle size={18} />} title="Kritik Stok" count={criticalStock.length} />
              <div className="mt-3 grid gap-2">
                {criticalStock.length === 0 && <EmptyState text="Kritik stok yok." />}
                {criticalStock.map((item) => (
                  <div key={item.product_id} className="flex items-center justify-between rounded border border-rose-200 bg-rose-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-rose-950">{item.product_name}</p>
                      <p className="text-xs text-rose-800">Eşik {formatNumber(item.critical_threshold)} {item.unit}</p>
                    </div>
                    <span className="rounded bg-white px-2 py-1 text-sm font-bold text-rose-900">
                      {formatNumber(item.quantity)} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded border border-stone-300 bg-white p-4 shadow-panel xl:col-span-2">
              <PanelTitle icon={<Boxes size={18} />} title="Stok Durumu" count={stock.length} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {stock.slice(0, 12).map((item) => (
                  <div
                    key={item.product_id}
                    className={`rounded border px-3 py-3 ${item.is_critical ? "border-rose-200 bg-rose-50" : "border-stone-200 bg-stone-50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.product_name}</p>
                        <p className="text-xs text-stone-500">{item.category}</p>
                      </div>
                      {item.is_critical ? (
                        <AlertTriangle className="shrink-0 text-rose-600" size={17} aria-label="Kritik stok" />
                      ) : (
                        <CheckCircle2 className="shrink-0 text-emerald-700" size={17} aria-label="Stok yeterli" />
                      )}
                    </div>
                    <p className="mt-3 text-xl font-bold">
                      {formatNumber(item.quantity)} <span className="text-sm font-medium text-stone-500">{item.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded border border-stone-300 bg-white p-4 shadow-panel xl:col-span-2">
              <PanelTitle icon={<History size={18} />} title="Konuşma Geçmişi" count={history.length} />
              <div className="mt-3 grid gap-3">
                {history.length === 0 && <EmptyState text="Henüz kayıt yok." />}
                {history.map((item) => (
                  <article key={item.id} className="rounded border border-stone-200 bg-stone-50 p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span className="rounded bg-stone-200 px-2 py-1 font-semibold text-stone-700">
                        {intentLabel(item.intent)}
                      </span>
                      <span>{item.response_time_ms} ms</span>
                    </div>
                    <p className="font-semibold text-stone-900">{item.user_query}</p>
                    <p className="mt-1 text-sm leading-6 text-stone-700">{item.ai_response}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function PanelTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded bg-stone-100 text-stone-700">{icon}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <span className="rounded bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">{count}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-500">
      <PackageCheck size={17} aria-hidden="true" />
      {text}
    </div>
  );
}
