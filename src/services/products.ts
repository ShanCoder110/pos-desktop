import type { Product } from "@/shared/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface ProductListParams {
  page?: number;
  perPage?: number;
  search?: string;
  categoryId?: string;
  productType?: "STANDARD" | "MANUFACTURED";
  isActive?: boolean;
  inStock?: boolean;
  lowStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "name" | "sku" | "stock" | "cost" | "createdAt";
  sortDirection?: "asc" | "desc";
}

export function listProducts(params: ProductListParams = {}, signal?: AbortSignal) {
  return apiRequest<PaginatedResponse<Product>>(
    `${API_ROUTES.products}${queryString(params)}`,
    { signal },
  );
}

export async function listAllProducts(signal?: AbortSignal): Promise<Product[]> {
  const products: Product[] = [];
  let page = 1;
  for (;;) {
    const response = await listProducts({ page, perPage: MAX_PAGE_SIZE, sortBy: "name", sortDirection: "asc" }, signal);
    products.push(...response.data);
    if (!response.meta.hasNextPage) return products;
    page += 1;
  }
}

export async function searchAllProducts(query: string, signal?: AbortSignal): Promise<Product[]> {
  const payload = await apiRequest<Product[] | { products?: Product[] }>(
    `${API_ROUTES.productSearch}${queryString({ q: query })}`,
    { signal },
  );
  return Array.isArray(payload) ? payload : payload.products ?? [];
}

export function getProduct(id: string, signal?: AbortSignal) {
  return apiRequest<Product>(`${API_ROUTES.products}/${encodeURIComponent(id)}`, { signal });
}

export function createProduct(payload: unknown) {
  return apiRequest<Product>(API_ROUTES.products, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProduct(id: string, payload: unknown) {
  return apiRequest<Product>(`${API_ROUTES.products}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(id: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `${API_ROUTES.products}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
