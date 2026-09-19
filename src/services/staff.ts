import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface StaffLedgerEntry {
  id: string;
  userId: string;
  userName?: string | null;
  branchId: string;
  entryType: string;
  moneyTransactionId?: string | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  notes?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface StaffLedgerResponse {
  userId: string;
  totalPaid: number;
  paidThisMonth: number;
  entries: StaffLedgerEntry[];
}

export interface StaffPayoutResponse {
  id: string;
  userId: string;
  amount: number;
  payoutType: string;
  paymentMethod: string;
  moneyTransactionId: string;
  balanceAfter: number;
  occurredAt: string;
}

export function listStaffLedgers(
  params: {
    page?: number;
    perPage?: number;
    search?: string;
    user?: string;
    entryType?: string;
    notes?: string;
    debit?: number;
    occurredFrom?: string;
    occurredTo?: string;
  } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<StaffLedgerEntry>>(
    `${API_ROUTES.staffLedgers}${queryString(params)}`,
    { signal },
  );
}

export async function listAllStaffLedgers(
  params: Omit<Parameters<typeof listStaffLedgers>[0], "page" | "perPage"> = {},
  signal?: AbortSignal,
) {
  const rows: StaffLedgerEntry[] = [];
  let page = 1;
  for (;;) {
    const response = await listStaffLedgers({ ...params, page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function getStaffLedger(userId: string, signal?: AbortSignal) {
  return apiRequest<StaffLedgerResponse>(API_ROUTES.userLedger(userId), { signal });
}

export function recordStaffPayout(
  userId: string,
  payload: {
    amount: number;
    payoutType: "SALARY" | "COMMISSION";
    paymentMethod?: string;
    notes?: string | null;
  },
) {
  return apiRequest<StaffPayoutResponse>(API_ROUTES.userPayouts(userId), {
    method: "POST",
    body: JSON.stringify({
      amount: payload.amount,
      payoutType: payload.payoutType,
      paymentMethod: payload.paymentMethod ?? "CASH",
      notes: payload.notes,
    }),
  });
}
