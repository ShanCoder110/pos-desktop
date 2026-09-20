import type {
  DomainCustomer,
  ItemCondition,
  LedgerRow,
  LedgerType,
  ReturnRow,
  ReturnType,
} from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";
import { listMasterRecords, type MasterRecord } from "@/services/masters";

export interface CustomerLedgerEntryResponse {
  id: string;
  customerId: string;
  customerName?: string | null;
  branchId: string;
  entryType: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  returnId?: string | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  notes?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface CustomerLedgerResponse {
  customerId: string;
  balance: number;
  entries: CustomerLedgerEntryResponse[];
}

export interface CustomerPaymentResponse {
  id: string;
  customerId: string;
  amount: number;
  paymentMethod: string;
  moneyTransactionId: string;
  balanceAfter: number;
  occurredAt: string;
}

export interface ReturnItemResponse {
  id: string;
  invoiceItemId: string;
  productId: string;
  displayedQuantity: number;
  baseQuantity: number;
  condition: string;
  refundAmount: number;
  restockAction: string;
}

export interface ReturnResponse {
  id: string;
  returnNumber: string;
  invoiceId: string;
  branchId: string;
  customerId?: string | null;
  returnType: string;
  status: string;
  reason: string;
  notes?: string | null;
  refundAmount: number;
  items: ReturnItemResponse[];
  createdAt: string;
  completedAt?: string | null;
}

export interface ClaimResponse {
  id: string;
  claimNumber: string;
  invoiceId?: string | null;
  customerId?: string | null;
  branchId: string;
  supplierId?: string | null;
  problem: string;
  diagnosis?: string | null;
  status: string;
  items: {
    id: string;
    productId: string;
    productLotId?: string | null;
    serialNumber?: string | null;
    quantity: number;
    condition: string;
    action: string;
    cost: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export function mapCustomer(record: MasterRecord, balance = 0): DomainCustomer {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone ?? "",
    cityId: record.cityId ?? "",
    cityName: record.cityName ?? "",
    address: record.address ?? "",
    currentBalance: balance,
    notes: record.notes ?? "",
    isActive: record.isActive,
    isWalkIn: Boolean(record.isWalkIn),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function mapLedgerEntry(entry: CustomerLedgerEntryResponse): LedgerRow {
  return {
    id: entry.id,
    customerId: entry.customerId,
    branchId: entry.branchId,
    invoiceId: entry.invoiceId ?? null,
    type: (entry.entryType as LedgerType) || "ADJUSTMENT",
    debit: entry.debit,
    credit: entry.credit,
    balanceAfter: entry.balanceAfter,
    notes: entry.notes ?? "",
    createdAt: entry.occurredAt || entry.createdAt,
  };
}

export function mapReturn(row: ReturnResponse): ReturnRow {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    branchId: row.branchId,
    customerId: row.customerId ?? null,
    type: (row.returnType as ReturnType) || "REFUND",
    refundAmount: row.refundAmount,
    reason: row.reason,
    notes: row.notes ?? "",
    createdBy: "",
    createdAt: row.createdAt,
    returnItems: (row.items ?? []).map((item) => ({
      productId: item.productId,
      lotId: "",
      quantity: item.displayedQuantity,
      baseQuantity: item.baseQuantity,
      condition: (item.condition as ItemCondition) || "GOOD",
      refundAmount: item.refundAmount,
    })),
    replacementItems: [],
  };
}

export type CustomerLedgerEntry = CustomerLedgerEntryResponse;

export function listCustomerLedgers(
  params: {
    page?: number;
    perPage?: number;
    search?: string;
    customer?: string;
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
  return apiRequest<PaginatedResponse<CustomerLedgerEntry>>(
    `${API_ROUTES.customerLedgers}${queryString(params)}`,
    { signal },
  );
}

export async function listAllCustomerLedgers(
  params: Omit<Parameters<typeof listCustomerLedgers>[0], "page" | "perPage"> = {},
  signal?: AbortSignal,
) {
  const rows: CustomerLedgerEntry[] = [];
  let page = 1;
  for (;;) {
    const response = await listCustomerLedgers({ ...params, page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function getCustomerLedger(customerId: string, signal?: AbortSignal) {
  return apiRequest<CustomerLedgerResponse>(API_ROUTES.customersLedger(customerId), { signal });
}

export function recordCustomerPayment(
  customerId: string,
  payload: {
    amount: number;
    paymentMethod?: string;
    referenceNumber?: string | null;
    notes?: string | null;
    clientRequestId?: string | null;
  },
) {
  return apiRequest<CustomerPaymentResponse>(API_ROUTES.customersPayments(customerId), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listCustomersWithBalances(signal?: AbortSignal): Promise<DomainCustomer[]> {
  const customers: DomainCustomer[] = [];
  let page = 1;
  for (;;) {
    const response = await listMasterRecords("customers", { page, perPage: MAX_PAGE_SIZE }, signal);
    for (const record of response.data) {
      customers.push(mapCustomer(record, record.balance ?? 0));
    }
    if (!response.meta.hasNextPage) return customers;
    page += 1;
  }
}

export function listReturns(
  params: {
    page?: number;
    perPage?: number;
    branchId?: string;
    invoiceId?: string;
    status?: string;
  } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<ReturnResponse>>(
    `${API_ROUTES.returns}${queryString(params)}`,
    { signal },
  );
}

export async function listAllReturns(signal?: AbortSignal): Promise<ReturnRow[]> {
  const rows: ReturnRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listReturns({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data.map(mapReturn));
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function listClaims(
  params: {
    page?: number;
    perPage?: number;
    branchId?: string;
    status?: string;
    customerId?: string;
  } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<ClaimResponse>>(
    `${API_ROUTES.claims}${queryString(params)}`,
    { signal },
  );
}

export async function listAllClaims(signal?: AbortSignal): Promise<ClaimResponse[]> {
  const rows: ClaimResponse[] = [];
  let page = 1;
  for (;;) {
    const response = await listClaims({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}
