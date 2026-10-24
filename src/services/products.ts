import type { Product } from "@/shared/types";
import type { ProductLotRow } from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";
import { cachedLocalRead } from "@/services/readCache";
import { listAllLots, listLots, mapLotResponse, type LotResponse } from "@/services/lots";
import { listMasterRecords } from "@/services/masters";
import { ApiError } from "@/utils/apiError";

export type ProductSalesSummaryRow = { productId: string; quantity: number; sales: number };
let catalogSalesSummary: ProductSalesSummaryRow[] | null = null;

export function getCachedProductSalesSummary() {
  return catalogSalesSummary;
}

export type ProductSortKey =
  | "createdAt"
  | "productNo"
  | "name"
  | "urduName"
  | "sku"
  | "category"
  | "supplier"
  | "cost"
  | "min"
  | "wholesale"
  | "retail"
  | "margin"
  | "sales"
  | "stock"
  | "minStock"
  | "recommended"
  | "lastCost"
  | "status";

export type ProductSort = { key: ProductSortKey; direction: "asc" | "desc" };

export interface ProductListParams {
  page?: number;
  perPage?: number;
  branchId?: string;
  search?: string;
  categoryId?: string;
  productType?: "STANDARD" | "MANUFACTURED";
  isActive?: boolean;
  inStock?: boolean;
  lowStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: ProductSortKey;
  sortDirection?: "asc" | "desc";
}

export function listProducts(params: ProductListParams = {}, signal?: AbortSignal) {
  return apiRequest<PaginatedResponse<Product>>(`${API_ROUTES.products}${queryString(params)}`, {
    signal,
  });
}

export async function listAllProducts(
  signal?: AbortSignal,
  branchId?: string,
  sort: ProductSort = { key: "name", direction: "asc" },
): Promise<Product[]> {
  return cachedLocalRead(
    `products:${branchId ?? "all"}:${sort.key}:${sort.direction}`,
    () => fetchAllProducts(branchId, sort),
    signal,
  );
}

async function fetchAllProducts(
  branchId: string | undefined,
  sort: ProductSort,
): Promise<Product[]> {
  let first: PaginatedResponse<Product>;
  try {
    first = await apiRequest<PaginatedResponse<Product>>(
      `${API_ROUTES.productsBulk}${queryString({ branchId, sortBy: sort.key, sortDirection: sort.direction })}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status !== 404) throw error;
    first = await listProducts({
      page: 1,
      perPage: MAX_PAGE_SIZE,
      sortBy: sort.key,
      sortDirection: sort.direction,
      branchId,
    });
    const products = [...first.data];
    for (let page = 2; page <= first.meta.totalPages; page += 1) {
      const response = await listProducts({
        page,
        perPage: MAX_PAGE_SIZE,
        sortBy: sort.key,
        sortDirection: sort.direction,
        branchId,
      });
      products.push(...response.data);
    }
    return products;
  }
  const products = [...first.data];
  if (!first.meta.hasNextPage) return products;
  let page = 51;
  for (;;) {
    const response = await listProducts({
      page,
      perPage: MAX_PAGE_SIZE,
      sortBy: sort.key,
      sortDirection: sort.direction,
      branchId,
    });
    products.push(...response.data);
    if (!response.meta.hasNextPage) return products;
    page += 1;
  }
}

export async function listProductCatalog(signal?: AbortSignal): Promise<{
  products: Product[];
  lots: ProductLotRow[];
  categories: { id: string; name: string }[];
  suppliers: {
    id: string;
    name: string;
    isActive: boolean;
    cityId?: string | null;
    cityName?: string | null;
  }[];
}> {
  return cachedLocalRead("productCatalog", fetchProductCatalog, signal);
}

async function fetchProductCatalog(): ReturnType<typeof listProductCatalog> {
  let snapshot: {
    products: PaginatedResponse<Product>;
    lots: PaginatedResponse<LotResponse>;
    salesSummary: ProductSalesSummaryRow[];
    categories: { id: string; name: string }[];
    suppliers: {
      id: string;
      name: string;
      isActive: boolean;
      cityId?: string | null;
      cityName?: string | null;
    }[];
  };
  try {
    snapshot = await apiRequest<typeof snapshot>(API_ROUTES.productCatalog);
  } catch (error) {
    // Vite can hot-reload before the local Rust API is restarted in development.
    if (error instanceof ApiError && error.status !== 404) throw error;
    const [products, lots, categories, suppliers, salesSummary] = await Promise.all([
      listAllProducts(),
      listAllLots({}).catch(() => [] as ProductLotRow[]),
      listMasterRecords("categories", { perPage: MAX_PAGE_SIZE, isActive: true }).catch(() => ({
        data: [] as { id: string; name: string }[],
      })),
      listMasterRecords("suppliers", { perPage: MAX_PAGE_SIZE }).catch(() => ({
        data: [] as { id: string; name: string; isActive: boolean }[],
      })),
      getProductSalesSummary().catch(() => [] as ProductSalesSummaryRow[]),
    ]);
    catalogSalesSummary = salesSummary;
    return { products, lots, categories: categories.data, suppliers: suppliers.data };
  }
  catalogSalesSummary = snapshot.salesSummary;
  const products = [...snapshot.products.data];
  const lots = snapshot.lots.data.map(mapLotResponse);
  for (
    let page = 51;
    page <= Math.ceil(snapshot.products.meta.totalItems / MAX_PAGE_SIZE);
    page += 1
  ) {
    const response = await listProducts({
      page,
      perPage: MAX_PAGE_SIZE,
      sortBy: "createdAt",
      sortDirection: "desc",
    });
    products.push(...response.data);
  }
  for (let page = 51; page <= Math.ceil(snapshot.lots.meta.totalItems / MAX_PAGE_SIZE); page += 1) {
    const response = await listLots({ page, perPage: MAX_PAGE_SIZE });
    lots.push(...response.data.map(mapLotResponse));
  }
  return { products, lots, categories: snapshot.categories, suppliers: snapshot.suppliers };
}

export async function searchAllProducts(query: string, signal?: AbortSignal): Promise<Product[]> {
  const payload = await apiRequest<Product[] | { products?: Product[] }>(
    `${API_ROUTES.productSearch}${queryString({ q: query })}`,
    { signal },
  );
  return Array.isArray(payload) ? payload : (payload.products ?? []);
}

export function getProduct(id: string, signal?: AbortSignal) {
  return apiRequest<Product>(API_ROUTES.productById(id), { signal });
}

export function getProductSalesSummary(signal?: AbortSignal) {
  return apiRequest<ProductSalesSummaryRow[]>(API_ROUTES.productSalesSummary, { signal });
}

export function createProduct(payload: unknown) {
  return apiRequest<Product>(API_ROUTES.products, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ProductImportResult = {
  created: number;
  skipped: number;
  categoriesCreated: number;
  errors: { index: number; name: string; sku?: string; message: string }[];
};

/** Bulk import catalog JSON from Settings → Products (see `imports/products-catalog.json`). */
export function importProductsCatalog(catalog: unknown) {
  return apiRequest<ProductImportResult>(API_ROUTES.productsImport, {
    method: "POST",
    body: JSON.stringify(catalog),
  });
}

export function updateProduct(id: string, payload: unknown) {
  return apiRequest<Product>(API_ROUTES.productById(id), {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(id: string) {
  return apiRequest<{ id: string; deleted: boolean }>(API_ROUTES.productById(id), {
    method: "DELETE",
  });
}
