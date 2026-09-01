import type { Product } from "@/shared/types";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export async function searchAllProducts(query: string, signal?: AbortSignal): Promise<Product[]> {
  const response = await fetch(`${API_BASE}/products/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`Product search failed (${response.status})`);
  const payload = await response.json() as Product[] | { products?: Product[] };
  return Array.isArray(payload) ? payload : payload.products ?? [];
}
