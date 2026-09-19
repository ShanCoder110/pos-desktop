import type { StockTransferRow, TransferStatus } from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface TransferItemResponse {
  id: string;
  productId: string;
  productLotId: string;
  requestedBaseQuantity: number;
  sentBaseQuantity: number;
  receivedBaseQuantity: number;
  damagedInTransitQuantity: number;
}

export interface TransferResponse {
  id: string;
  transferNumber: string;
  fromBranchId: string;
  toBranchId: string;
  status: string;
  notes?: string | null;
  items: TransferItemResponse[];
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
}

export function mapTransfer(row: TransferResponse): StockTransferRow {
  return {
    id: row.id,
    fromBranchId: row.fromBranchId,
    toBranchId: row.toBranchId,
    status: (row.status as TransferStatus) || "PENDING",
    notes: row.notes ?? "",
    createdBy: "",
    createdAt: row.createdAt,
    completedAt: row.receivedAt ?? null,
    items: (row.items ?? []).map((item) => ({
      productId: item.productId,
      productLotId: item.productLotId,
      quantity: item.requestedBaseQuantity,
    })),
  };
}

export function listTransfers(
  params: {
    page?: number;
    perPage?: number;
    status?: string;
    fromBranchId?: string;
    toBranchId?: string;
  } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<TransferResponse>>(
    `${API_ROUTES.transfers}${queryString(params)}`,
    { signal },
  );
}

export async function listAllTransfers(signal?: AbortSignal): Promise<StockTransferRow[]> {
  const rows: StockTransferRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listTransfers({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data.map(mapTransfer));
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function createTransfer(payload: {
  fromBranchId: string;
  toBranchId: string;
  notes?: string | null;
  items: { productId: string; productLotId: string; quantity: number }[];
}) {
  return apiRequest<TransferResponse>(API_ROUTES.transfers, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(mapTransfer);
}

export function sendTransfer(id: string) {
  return apiRequest<TransferResponse>(API_ROUTES.transferSend(id), {
    method: "POST",
    body: JSON.stringify({}),
  }).then(mapTransfer);
}

export function receiveTransfer(id: string, payload?: Record<string, unknown>) {
  return apiRequest<TransferResponse>(API_ROUTES.transferReceive(id), {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  }).then(mapTransfer);
}
