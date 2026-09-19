import type { CatalogProduct, StockMoveType, StockMovementRow } from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface StockResponse {
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  unit: string;
  branchId: string;
  remaining: number;
  reserved: number;
  damaged: number;
  minimumStock: number;
  isLow: boolean;
}

export interface StockMovementResponse {
  id: string;
  branchId: string;
  productId: string;
  productName: string;
  productLotId?: string | null;
  movementType: string;
  displayedQuantity: number;
  displayedUnitName: string;
  baseQuantityDelta: number;
  unitCost?: number | null;
  totalCost?: number | null;
  referenceType: string;
  referenceId: string;
  notes?: string | null;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
}

export function mapStockRow(row: StockResponse, isManufactured = false): CatalogProduct {
  return {
    id: row.productId,
    name: row.productName,
    sku: row.sku,
    barcode: row.barcode,
    category: "",
    baseUnit: row.unit,
    minimumStock: row.minimumStock,
    isManufactured,
    onHand: row.remaining,
  };
}

export function mapStockMovement(row: StockMovementResponse): StockMovementRow {
  return {
    id: row.id,
    productId: row.productId,
    productLotId: row.productLotId ?? "",
    branchId: row.branchId,
    type: (row.movementType as StockMoveType) || "ADJUSTMENT",
    quantity: row.baseQuantityDelta,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    notes: row.notes ?? "",
    createdBy: row.createdBy,
    createdAt: row.occurredAt || row.createdAt,
  };
}

export function listStock(
  params: { page?: number; perPage?: number; branchId?: string; productId?: string; lowStock?: boolean } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<StockResponse>>(`${API_ROUTES.stock}${queryString(params)}`, { signal });
}

export async function listAllStock(signal?: AbortSignal): Promise<StockResponse[]> {
  const rows: StockResponse[] = [];
  let page = 1;
  for (;;) {
    const response = await listStock({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function listStockMovements(
  params: { page?: number; perPage?: number; branchId?: string; productId?: string; movementType?: string } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<StockMovementResponse>>(
    `${API_ROUTES.stockMovements}${queryString(params)}`,
    { signal },
  );
}

export async function listAllStockMovements(
  params: { productId?: string; branchId?: string } = {},
  signal?: AbortSignal,
): Promise<StockMovementRow[]> {
  const rows = await listAllStockMovementDetails(params, signal);
  return rows.map(mapStockMovement);
}

export async function listAllStockMovementDetails(
  params: { productId?: string; branchId?: string } = {},
  signal?: AbortSignal,
): Promise<StockMovementResponse[]> {
  const rows: StockMovementResponse[] = [];
  let page = 1;
  for (;;) {
    const response = await listStockMovements({ ...params, page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}
