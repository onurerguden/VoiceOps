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
  TrendingDown,
  Truck,
  Volume2,
  Warehouse,
  Zap,
} from "lucide-react";
import { api, HistoryItem, Order, QueryResponse, Stock } from "./api";

type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

const statusCopy: Record<VoiceState, string> = {
  idle: "Hazır — komut bekliyor",
  listening: "🎤 Dinliyor...",
  processing: "⚡ İşleniyor...",
  speaking: "🔊 Konuşuyor...",
  error: "⚠️ Hata",
};

const demoPrompts = [
  { text: "105 numaralı sipariş nerede?", icon: "📦" },
  { text: "Domatesten kaç kilo kaldı?", icon: "🍅" },
  { text: "Domatesten 5 kilo düş", icon: "📉" },
  { text: "Bugün kaç sipariş geldi?", icon: "📊" },
  { text: "Kritik stokta ne var?", icon: "🚨" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

function statusConfig(status: string) {
  if (status === "teslim edildi") return { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-400" };
  if (status === "kargoda") return { bg: "bg-sky-500/15", text: "text-sky-400", dot: "bg-sky-400" };
  if (status === "hazırlanıyor") return { bg: "bg-amber-500/15", text: "text-amber-400", dot: "bg-amber-400" };
  return { bg: "bg-slate-500/15", text: "text-slate-400", dot: "bg-slate-400" };
}

function intentLabel(intent: string | null) {
  const labels: Record<string, { text: string; color: string }> = {
    get_order_status: { text: "Sipariş", color: "bg-sky-500/20 text-sky-400" },
    check_stock: { text: "Stok", color: "bg-emerald-500/20 text-emerald-400" },
    get_daily_summary: { text: "Özet", color: "bg-violet-500/20 text-violet-400" },
    get_critical_stock: { text: "Kritik", color: "bg-rose-500/20 text-rose-400" },
    get_customer_info: { text: "Müşteri", color: "bg-amber-500/20 text-amber-400" },
    list_pending_orders: { text: "Bekleyen", color: "bg-orange-500/20 text-orange-400" },
    update_stock: { text: "Güncelleme", color: "bg-teal-500/20 text-teal-400" },
  };
  const found = intent ? labels[intent] : null;
  return found ?? { text: "Belirsiz", color: "bg-slate-500/20 text-slate-400" };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

/* ═══════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════ */
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
    <>
      {/* Background gradient mesh */}
      <div className="bg-mesh" />

      <main className="relative z-10 min-h-screen text-slate-100">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

          {/* ── Header ── */}
          <header className="glass-strong flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                <Warehouse size={24} className="text-white" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  <span className="text-gradient">VoiceOps</span>
                </h1>
                <p className="text-sm text-slate-400">Depo içi sesli operasyon asistanı</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`status-dot status-${voiceState}`} />
              <span className="text-sm font-medium text-slate-300">{statusCopy[voiceState]}</span>
            </div>
          </header>

          {/* ── Main Grid ── */}
          <section className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">

            {/* ── Left: Voice Control Panel ── */}
            <div className="flex flex-col gap-5">
              {/* Mic Button */}
              <div className="glass-strong p-5">
                <button
                  id="mic-button"
                  type="button"
                  onClick={voiceState === "listening" ? stopListening : startListening}
                  className={`mic-button ${voiceState === "listening" ? "is-listening" : ""}`}
                  aria-label={voiceState === "listening" ? "Dinlemeyi durdur" : "Mikrofonu başlat"}
                  title={voiceState === "listening" ? "Dinlemeyi durdur" : "Mikrofonu başlat"}
                >
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    {voiceState === "listening" ? (
                      <MicOff size={48} className="drop-shadow-lg" />
                    ) : voiceState === "processing" ? (
                      <Loader2 size={48} className="animate-spin drop-shadow-lg" />
                    ) : voiceState === "speaking" ? (
                      <Volume2 size={48} className="drop-shadow-lg" />
                    ) : (
                      <Mic size={48} className="drop-shadow-lg" />
                    )}

                    {/* Wave bars - visible when listening */}
                    <div className="wave-bars">
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                      <div className="wave-bar" />
                    </div>

                    <span className="text-sm font-semibold opacity-80">
                      {voiceState === "listening"
                        ? "Dinleniyor... Durdurmak için dokun"
                        : voiceState === "processing"
                        ? "Gemini işliyor..."
                        : voiceState === "speaking"
                        ? "Yanıt okunuyor..."
                        : "Dokunarak konuş"}
                    </span>
                  </div>
                </button>
              </div>

              {/* Response Card */}
              <div className="glass-strong p-5 animate-fade-in">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Volume2 size={14} aria-hidden="true" />
                  Son Yanıt
                </div>
                <p className="min-h-[64px] text-base font-medium leading-7 text-slate-100">
                  {lastResponse?.answer ?? (
                    <span className="text-slate-500 italic">Sesli komut bekleniyor...</span>
                  )}
                </p>
                {lastResponse && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${intentLabel(lastResponse.intent).color}`}>
                      <Zap size={11} />
                      {intentLabel(lastResponse.intent).text}
                    </span>
                    <span className="rounded-full bg-slate-700/50 px-3 py-1 text-xs font-medium text-slate-300">
                      ⚡ {lastResponse.response_time_ms} ms
                    </span>
                  </div>
                )}
              </div>

              {/* Manual Input */}
              <form onSubmit={handleManualSubmit} className="glass-strong flex gap-2 p-3">
                <input
                  id="query-input"
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-500/50 focus:bg-white/8 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Komut yazın veya yukarıdan konuşun..."
                />
                <button
                  id="submit-query"
                  type="submit"
                  disabled={!manualText.trim() || isBusy}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-emerald-500/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
                  aria-label="Komutu gönder"
                  title="Komutu gönder"
                >
                  {voiceState === "processing" ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </form>

              {/* Demo Prompts */}
              <div className="glass-strong p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Hazır Komutlar
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {demoPrompts.map((prompt) => (
                    <button
                      key={prompt.text}
                      type="button"
                      onClick={() => void submitQuery(prompt.text)}
                      disabled={isBusy}
                      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-left text-sm font-medium text-slate-300 transition hover:border-emerald-500/30 hover:bg-emerald-500/8 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="text-lg">{prompt.icon}</span>
                      {prompt.text}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="animate-slide-up flex gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 backdrop-blur">
                  <AlertTriangle className="mt-0.5 shrink-0 text-rose-400" size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* ── Right: Dashboard Panels ── */}
            <div className="grid gap-6 xl:grid-cols-2">

              {/* Orders Panel */}
              <section className="glass-strong p-5 animate-fade-in" style={{ animationDelay: "0.1s" }}>
                <PanelTitle
                  icon={<ClipboardList size={18} />}
                  title="Son Siparişler"
                  count={orders.length}
                  accentColor="sky"
                />
                <div className="mt-4 space-y-2">
                  {orders.slice(0, 8).map((order) => {
                    const sc = statusConfig(order.status);
                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between rounded-xl border border-white/6 bg-white/3 px-4 py-3 transition hover:bg-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100">#{order.id}</span>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${sc.bg} ${sc.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                              {order.status}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-400">
                            {order.customer_name}
                            {order.cargo_company && (
                              <span className="ml-2 inline-flex items-center gap-1 text-slate-500">
                                <Truck size={10} /> {order.cargo_company}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-200">{formatCurrency(order.total_amount)}</p>
                          {order.estimated_delivery && (
                            <p className="text-xs text-slate-500">{order.estimated_delivery}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Critical Stock Panel */}
              <section className="glass-strong p-5 animate-fade-in" style={{ animationDelay: "0.15s" }}>
                <PanelTitle
                  icon={<AlertTriangle size={18} />}
                  title="Kritik Stok"
                  count={criticalStock.length}
                  accentColor="rose"
                />
                <div className="mt-4 space-y-2">
                  {criticalStock.length === 0 && <EmptyState text="Kritik stok yok — her şey yeterli." />}
                  {criticalStock.map((item) => {
                    const pct = Math.min((item.quantity / (item.critical_threshold * 2)) * 100, 100);
                    return (
                      <div
                        key={item.product_id}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 transition hover:bg-rose-500/8"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold text-rose-300">{item.product_name}</p>
                            <p className="text-xs text-rose-400/70">
                              Eşik: {formatNumber(item.critical_threshold)} {item.unit}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingDown size={14} className="text-rose-400" />
                            <span className="text-lg font-bold text-rose-300">
                              {formatNumber(item.quantity)}
                            </span>
                            <span className="text-xs text-rose-400/70">{item.unit}</span>
                          </div>
                        </div>
                        <div className="stock-bar-bg mt-2">
                          <div
                            className="stock-bar-fill bg-gradient-to-r from-rose-500 to-rose-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* All Stock Panel */}
              <section className="glass-strong p-5 animate-fade-in xl:col-span-2" style={{ animationDelay: "0.2s" }}>
                <PanelTitle
                  icon={<Boxes size={18} />}
                  title="Stok Durumu"
                  count={stock.length}
                  accentColor="emerald"
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stock.slice(0, 12).map((item) => {
                    const maxQty = item.critical_threshold * 3;
                    const pct = Math.min((item.quantity / maxQty) * 100, 100);
                    const barColor = item.is_critical
                      ? "from-rose-500 to-rose-400"
                      : "from-emerald-500 to-teal-400";

                    return (
                      <div
                        key={item.product_id}
                        className={`rounded-xl border px-4 py-3 transition hover:bg-white/3 ${
                          item.is_critical
                            ? "border-rose-500/20 bg-rose-500/5"
                            : "border-white/6 bg-white/3"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-100">{item.product_name}</p>
                            <p className="text-xs text-slate-500">{item.category}</p>
                          </div>
                          {item.is_critical ? (
                            <AlertTriangle className="shrink-0 text-rose-400" size={16} aria-label="Kritik stok" />
                          ) : (
                            <CheckCircle2 className="shrink-0 text-emerald-400" size={16} aria-label="Stok yeterli" />
                          )}
                        </div>
                        <p className="mt-2 text-xl font-bold text-slate-100">
                          {formatNumber(item.quantity)}{" "}
                          <span className="text-sm font-medium text-slate-500">{item.unit}</span>
                        </p>
                        <div className="stock-bar-bg mt-2">
                          <div
                            className={`stock-bar-fill bg-gradient-to-r ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Conversation History */}
              <section className="glass-strong p-5 animate-fade-in xl:col-span-2" style={{ animationDelay: "0.25s" }}>
                <PanelTitle
                  icon={<History size={18} />}
                  title="Konuşma Geçmişi"
                  count={history.length}
                  accentColor="violet"
                />
                <div className="mt-4 space-y-3">
                  {history.length === 0 && <EmptyState text="Henüz konuşma yok — mikrofona dokunarak başlayın." />}
                  {history.map((item) => {
                    const il = intentLabel(item.intent);
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-white/6 bg-white/3 p-4 transition hover:bg-white/5"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${il.color}`}>
                            <Zap size={10} />
                            {il.text}
                          </span>
                          <span className="text-xs text-slate-500">
                            {item.response_time_ms} ms • {timeAgo(item.created_at)}
                          </span>
                        </div>
                        {/* User message bubble */}
                        <div className="mb-2 flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-emerald-500/15 px-4 py-2.5">
                            <p className="text-sm font-semibold text-emerald-300">{item.user_query}</p>
                          </div>
                        </div>
                        {/* AI response bubble */}
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-white/5 px-4 py-2.5">
                            <p className="text-sm leading-6 text-slate-300">{item.ai_response}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="border-t border-white/6 pt-4 text-center text-xs text-slate-500">
            VoiceOps © 2026 — Hackathon Google Gemini&nbsp;·&nbsp;FastAPI + React + Gemini 2.5 Flash
          </footer>
        </div>
      </main>
    </>
  );
}

/* ═══════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════ */

function PanelTitle({
  icon,
  title,
  count,
  accentColor,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  accentColor: string;
}) {
  const colorMap: Record<string, string> = {
    sky: "from-sky-500 to-blue-600",
    rose: "from-rose-500 to-pink-600",
    emerald: "from-emerald-500 to-teal-600",
    violet: "from-violet-500 to-purple-600",
    amber: "from-amber-500 to-orange-600",
  };
  const gradient = colorMap[accentColor] ?? colorMap.emerald;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-lg`}>
          {icon}
        </span>
        <h2 className="text-base font-bold text-slate-100">{title}</h2>
      </div>
      <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-slate-300">
        {count}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/3 px-4 py-4 text-sm text-slate-400">
      <PackageCheck size={18} className="text-slate-500" aria-hidden="true" />
      {text}
    </div>
  );
}
