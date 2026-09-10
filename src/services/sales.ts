import type { InvoiceItemRow, InvoiceRow, PaymentStatus, InvoiceState } from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface InvoiceItemResponse {
  id: string;
  productId: string;
  productUnitId?: string | null;
  productName: string;
  sku: string;
  unitName: string;
  displayedQuantity: number;
  conversionToBase: number;
  baseQuantity: number;
  unitPrice: number;
  minimumPriceSnapshot: number;
  priceMode: string;
  soldBelowMinimum: boolean;
  authorizedBy?: string | null;
  discount: number;
  tax: number;
  lineTotal: number;
  fifoCost: number;
  grossProfit: number;
}

export interface InvoiceResponse {
  id: string;
  branchId: string;
  customerId?: string | null;
  invoiceNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  creditAmount: number;
  changeAmount: number;
  notes?: string | null;
  cashierName: string;
  clientRequestId: string;
  items: InvoiceItemResponse[];
  payments: unknown[];
  completedAt?: string | null;
  voidReason?: string | null;
  voidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HoldResponse {
  id: string;
  label: string;
  customerId?: string | null;
  payload: unknown;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompleteSalePayload {
  clientRequestId: string;
  customerId?: string | null;
  items: {
    productId: string;
    productUnitId: string;
    quantity: number;
    unitPrice: number;
    priceMode?: string;
    soldBelowMinimum?: boolean;
    authorizedBy?: string | null;
    discount?: number;
    tax?: number;
  }[];
  payments: {
    amount: number;
    amountTendered?: number | null;
    paymentMethod?: string;
    referenceNumber?: string | null;
    notes?: string | null;
    clientRequestId?: string | null;
  }[];
  discount?: number;
  tax?: number;
  notes?: string | null;
}

export function mapInvoice(row: InvoiceResponse): InvoiceRow {
  const items: InvoiceItemRow[] = (row.items ?? []).map((item) => ({
    id: item.id,
    productId: item.productId,
    unitName: item.unitName,
    quantity: item.displayedQuantity,
    baseQuantity: item.baseQuantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    total: item.lineTotal,
  }));
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    branchId: row.branchId,
    customerId: row.customerId ?? null,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    paidAmount: row.paidAmount,
    creditAmount: row.creditAmount,
    paymentStatus: (row.paymentStatus as PaymentStatus) || "UNPAID",
    status: (row.status as InvoiceState) || "COMPLETED",
    notes: row.notes ?? "",
    createdBy: row.cashierName,
    createdAt: row.createdAt,
    items,
  };
}

export function listInvoices(
  params: {
    page?: number;
    perPage?: number;
    branchId?: string;
    customerId?: string;
    status?: string;
    paymentStatus?: string;
  } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<InvoiceResponse>>(
    `${API_ROUTES.invoices}${queryString(params)}`,
    { signal },
  );
}

export async function listAllInvoices(signal?: AbortSignal): Promise<InvoiceRow[]> {
  const rows: InvoiceRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listInvoices({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data.map(mapInvoice));
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function getInvoice(id: string, signal?: AbortSignal) {
  return apiRequest<InvoiceResponse>(API_ROUTES.invoiceById(id), { signal }).then(mapInvoice);
}

export function completeSale(payload: CompleteSalePayload) {
  return apiRequest<InvoiceResponse>(API_ROUTES.salesComplete, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(mapInvoice);
}

export function voidInvoice(id: string, reason?: string) {
  return apiRequest<InvoiceResponse>(API_ROUTES.invoiceVoid(id), {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? "" }),
  }).then(mapInvoice);
}

export function listHolds(signal?: AbortSignal) {
  return apiRequest<HoldResponse[] | PaginatedResponse<HoldResponse>>(
    API_ROUTES.salesHolds,
    { signal },
  ).then((payload) => (Array.isArray(payload) ? payload : payload.data ?? []));
}

export function createHold(payload: {
  label: string;
  customerId?: string | null;
  payload: unknown;
  expiresAt?: string | null;
}) {
  return apiRequest<HoldResponse>(API_ROUTES.salesHolds, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteHold(id: string) {
  return apiRequest<{ id: string; deleted: boolean }>(API_ROUTES.salesHoldById(id), {
    method: "DELETE",
  });
}
