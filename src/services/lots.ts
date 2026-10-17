import type { ProductLotRow } from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface LotResponse {
  id: string;
  productId: string;
  productName: string;
  supplierId?: string | null;
  lotNumber: string;
  sourceType: string;
  originalBaseQuantity: number;
  remainingBaseQuantity: number;
  damagedBaseQuantity: number;
  /** Committed sales — never residual (original − left − damaged). */
  soldBaseQuantity?: number;
  /** Stock-count / adjustment downs (cost only). */
  shrunkBaseQuantity?: number;
  soldRevenue?: number;
  soldProfit?: number;
  shrinkCost?: number;
  purchasePricePerBase: number;
  receivedDate: string;
  expiryDate?: string | null;
  branchLots?: {
    id: string;
    branchId: string;
    productLotId: string;
    allocatedBaseQuantity: number;
    remainingBaseQuantity: number;
    reservedBaseQuantity: number;
    damagedBaseQuantity: number;
    updatedAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
  purchaseOrderId?: string | null;
  purchaseOrderNumber?: string | null;
  purchaseOrderStatus?: string | null;
}

export interface LotBranchAllocationPayload {
  branchId: string;
  quantity: number;
}

export interface ReceiveLotPayload {
  productId: string;
  branchId?: string;
  branchAllocations?: LotBranchAllocationPayload[];
  supplierId?: string | null;
  quantity: number;
  cost: number;
  receivedDate: string;
  expiryDate?: string | null;
  sourceType: "OPENING" | "PURCHASE" | string;
  min?: number;
  wholesale?: number;
  retail?: number;
  damagedQuantity?: number;
  paidNow?: number;
  purchaseOrderId?: string;
}

export interface LotListParams {
  page?: number;
  perPage?: number;
  search?: string;
  productId?: string;
  branchId?: string;
  sourceType?: string;
  supplierId?: string;
  city?: string;
  lotStatus?: string;
  occurredFrom?: string;
  occurredTo?: string;
  minValueLeft?: number;
}

export interface UpdateLotPayload {
  supplierId?: string;
  originalQuantity?: number;
  remainingQuantity?: number;
  damagedQuantity?: number;
  cost?: number;
  min?: number;
  wholesale?: number;
  retail?: number;
  branchAllocations?: LotBranchAllocationPayload[];
}

export function mapLotResponse(lot: LotResponse): ProductLotRow {
  const purchase = lot.purchasePricePerBase ?? 0;
  return {
    id: lot.id,
    productId: lot.productId,
    supplierId: lot.supplierId ?? "",
    lotNumber: lot.lotNumber,
    purchasePrice: purchase,
    minimumPrice: 0,
    wholesalePrice: 0,
    retailPrice: 0,
    originalQuantity: lot.originalBaseQuantity,
    remainingQuantity: lot.remainingBaseQuantity,
    damagedQuantity: lot.damagedBaseQuantity,
    soldQuantity: Math.max(0, Number(lot.soldBaseQuantity) || 0),
    shrunkQuantity: Math.max(0, Number(lot.shrunkBaseQuantity) || 0),
    soldRevenue: Math.max(0, Number(lot.soldRevenue) || 0),
    soldProfit: Number(lot.soldProfit) || 0,
    shrinkCost: Math.max(0, Number(lot.shrinkCost) || 0),
    receivedAt: lot.receivedDate,
    expiryDate: lot.expiryDate ?? null,
    createdBy: "",
    branchAllocations: lot.branchLots?.map((row) => ({
      branchId: row.branchId,
      quantity: row.remainingBaseQuantity,
    })),
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
    purchaseOrderId: lot.purchaseOrderId,
    purchaseOrderNumber: lot.purchaseOrderNumber,
    purchaseOrderStatus: lot.purchaseOrderStatus,
  };
}

export function listLots(params: LotListParams = {}, signal?: AbortSignal) {
  return apiRequest<PaginatedResponse<LotResponse>>(`${API_ROUTES.lots}${queryString(params)}`, {
    signal,
  });
}

export async function listAllLots(
  params: Omit<LotListParams, "page" | "perPage"> = {},
  signal?: AbortSignal,
): Promise<ProductLotRow[]> {
  const lots: ProductLotRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listLots({ ...params, page, perPage: MAX_PAGE_SIZE }, signal);
    lots.push(...response.data.map(mapLotResponse));
    if (!response.meta.hasNextPage) return lots;
    page += 1;
  }
}

export function getLot(id: string, signal?: AbortSignal) {
  return apiRequest<LotResponse>(API_ROUTES.lotById(id), { signal }).then(mapLotResponse);
}

export function receiveLot(payload: ReceiveLotPayload) {
  return apiRequest<LotResponse>(API_ROUTES.lotsReceive, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(mapLotResponse);
}

export function updateLot(id: string, payload: UpdateLotPayload) {
  return apiRequest<LotResponse>(API_ROUTES.lotById(id), {
    method: "PUT",
    body: JSON.stringify(payload),
  }).then(mapLotResponse);
}

/** Build receive payload from a ProductLotRow filled by LotForm. */
export function receivePayloadFromLot(lot: ProductLotRow): ReceiveLotPayload {
  const allocations = (lot.branchAllocations ?? [])
    .filter((row) => row.quantity > 0)
    .map((row) => ({ branchId: row.branchId, quantity: row.quantity }));

  const payload: ReceiveLotPayload = {
    productId: lot.productId,
    supplierId: lot.supplierId || null,
    quantity: lot.originalQuantity,
    cost: lot.purchasePrice,
    receivedDate: lot.receivedAt.slice(0, 10),
    expiryDate: lot.expiryDate,
    sourceType: lot.supplierId ? "PURCHASE" : "OPENING",
    min: lot.minimumPrice,
    wholesale: lot.wholesalePrice,
    retail: lot.retailPrice,
    damagedQuantity: lot.damagedQuantity,
    paidNow: lot.paidNow ?? 0,
    purchaseOrderId: lot.purchaseOrderId || undefined,
  };

  if (allocations.length > 1) {
    payload.branchAllocations = allocations;
  } else if (allocations.length === 1) {
    payload.branchId = allocations[0].branchId;
  } else if (lot.branchId) {
    payload.branchId = lot.branchId;
  }

  return payload;
}
