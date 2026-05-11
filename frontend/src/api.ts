const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface OrderItem {
  product_name: string;
  quantity: number;
  unit: string;
}

export interface Order {
  id: number;
  customer_name: string;
  status: string;
  cargo_company: string | null;
  tracking_no: string | null;
  estimated_delivery: string | null;
  created_at: string;
  total_amount: number;
  items: OrderItem[];
}

export interface Stock {
  product_id: number;
  product_name: string;
  unit: string;
  category: string;
  quantity: number;
  critical_threshold: number;
  is_critical: boolean;
  updated_at: string;
}

export interface HistoryItem {
  id: number;
  user_query: string;
  intent: string | null;
  ai_response: string;
  created_at: string;
  response_time_ms: number;
}

export interface QueryResponse {
  transcript: string;
  answer: string;
  intent: string | null;
  updated_stock: Stock | null;
  response_time_ms: number;
  ok: boolean;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = typeof payload?.detail === "string" ? payload.detail : "API isteği başarısız oldu.";
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export const api = {
  query: (text: string) =>
    request<QueryResponse>("/api/query", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  orders: (limit = 10) => request<Order[]>(`/api/orders?limit=${limit}`),
  stock: (criticalOnly = false) => request<Stock[]>(`/api/stock?critical_only=${criticalOnly}`),
  history: (limit = 10) => request<HistoryItem[]>(`/api/history?limit=${limit}`),
  health: () => request<{ ok: boolean; service: string; model: string }>("/api/health"),
};
