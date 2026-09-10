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
}

export interface ReceiveLotPayload {
  productId: string;
  branchId?: string;
  supplierId?: string | null;
  quantity: number;
  cost: number;
  receivedDate: string;
  expiryDate?: string | null;
  sourceType: "OPENING" | "PURCHASE" | string;
  min?: number;
  wholesale?: number;
  retail?: number;
}

export interface LotListParams {
  page?: number;
  perPage?: number;
  productId?: string;
  branchId?: string;
  sourceType?: string;
}

export function mapLotResponse(lot: LotResponse): ProductLotRow {
  const purchase = lot.purchasePricePerBase ?? 0;
  return {
    id: lot.id,
    productId: lot.productId,
    supplierId: lot.supplierId ?? "",
    lotNumber: lot.lotNumber,
    purchasePrice: purchase,
    minimumPrice: purchase,
    wholesalePrice: purchase,
    retailPrice: purchase,
    originalQuantity: lot.originalBaseQuantity,
    remainingQuantity: lot.remainingBaseQuantity,
    damagedQuantity: lot.damagedBaseQuantity,
    receivedAt: lot.receivedDate,
    expiryDate: lot.expiryDate ?? null,
    createdBy: "",
  };
}

export function listLots(params: LotListParams = {}, signal?: AbortSignal) {
  return apiRequest<PaginatedResponse<LotResponse>>(
    `${API_ROUTES.lots}${queryString(params)}`,
    { signal },
  );
}

export async function listAllLots(signal?: AbortSignal): Promise<ProductLotRow[]> {
  const lots: ProductLotRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listLots({ page, perPage: MAX_PAGE_SIZE }, signal);
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

/** Build receive payload from a ProductLotRow filled by LotForm. */
export function receivePayloadFromLot(lot: ProductLotRow): ReceiveLotPayload {
  return {
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
  };
}
