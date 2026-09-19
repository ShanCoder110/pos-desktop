import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface SupplierLedgerEntry {
  id: string;
  supplierId: string;
  supplierName?: string;
  branchId: string;
  entryType: string;
  purchaseOrderId?: string | null;
  goodsReceiptId?: string | null;
  moneyTransactionId?: string | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  notes?: string | null;
  occurredAt: string;
  createdAt: string;
}

export function listSupplierLedgers(
  params: {
    page?: number;
    perPage?: number;
    search?: string;
    supplier?: string;
    entryType?: string;
    notes?: string;
    balance?: string;
    debit?: number;
    credit?: number;
    occurredFrom?: string;
    occurredTo?: string;
  } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<SupplierLedgerEntry>>(
    `${API_ROUTES.supplierLedgers}${queryString(params)}`,
    { signal },
  );
}

export async function listAllSupplierLedgers(
  params: Omit<Parameters<typeof listSupplierLedgers>[0], "page" | "perPage"> = {},
  signal?: AbortSignal,
) {
  const rows: SupplierLedgerEntry[] = [];
  let page = 1;
  for (;;) {
    const response = await listSupplierLedgers({ ...params, page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function getSupplierLedger(supplierId: string, signal?: AbortSignal) {
  return apiRequest<SupplierLedgerEntry[]>(API_ROUTES.supplierLedger(supplierId), { signal });
}

export function recordSupplierPayment(
  supplierId: string,
  payload: { amount: number; paymentMethod: string; notes?: string; referenceNumber?: string },
) {
  return apiRequest<{ balanceAfter: number }>(API_ROUTES.supplierPayments(supplierId), {
    method: "POST",
    body: JSON.stringify({
      amount: payload.amount,
      paymentMethod: payload.paymentMethod,
      notes: payload.notes,
      referenceNumber: payload.referenceNumber,
    }),
  });
}
