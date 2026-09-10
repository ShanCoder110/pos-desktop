import type {
  ExpenseCategory,
  ExpenseRow,
  MoneyTxnRow,
  MoneyDirection,
  PaymentMethod,
  TxnType,
} from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface ExpenseCategoryResponse {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseResponse {
  id: string;
  branchId: string;
  categoryId: string;
  amount: number;
  paymentMethod: string;
  description: string;
  expenseDate: string;
  moneyTransactionId: string;
  createdAt: string;
}

export interface MoneyTransactionResponse {
  id: string;
  branchId: string;
  cashSessionId?: string | null;
  direction: string;
  transactionType: string;
  amount: number;
  paymentMethod: string;
  referenceType: string;
  referenceId: string;
  partyType?: string | null;
  partyId?: string | null;
  notes?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface DashboardReport {
  todaySalesTotal: number;
  creditOutstanding: number;
  lowStockCount: number;
  openRepairs: number;
}

export interface AnalyticsReport {
  salesByDay: { day: string; total: number }[];
  topProducts: { productId: string; productName: string; quantity: number; revenue: number }[];
}

export function mapExpenseCategory(row: ExpenseCategoryResponse): ExpenseCategory {
  return { id: row.id, name: row.name, isActive: row.isActive };
}

export function mapExpense(row: ExpenseResponse): ExpenseRow {
  return {
    id: row.id,
    branchId: row.branchId,
    categoryId: row.categoryId,
    amount: row.amount,
    paymentMethod: (row.paymentMethod as PaymentMethod) || "CASH",
    description: row.description,
    expenseDate: row.expenseDate,
    createdBy: "",
  };
}

export function mapTransaction(row: MoneyTransactionResponse): MoneyTxnRow {
  return {
    id: row.id,
    branchId: row.branchId,
    type: (row.transactionType as TxnType) || "SALE_PAYMENT",
    direction: (row.direction as MoneyDirection) || "IN",
    amount: row.amount,
    paymentMethod: (row.paymentMethod as PaymentMethod) || "CASH",
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    notes: row.notes ?? "",
    createdBy: "",
    createdAt: row.occurredAt || row.createdAt,
  };
}

export function listExpenseCategories(signal?: AbortSignal) {
  return apiRequest<ExpenseCategoryResponse[] | PaginatedResponse<ExpenseCategoryResponse>>(
    API_ROUTES.expenseCategories,
    { signal },
  ).then((payload) =>
    (Array.isArray(payload) ? payload : payload.data ?? []).map(mapExpenseCategory),
  );
}

export function listExpenses(
  params: { page?: number; perPage?: number; branchId?: string; categoryId?: string } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<ExpenseResponse>>(
    `${API_ROUTES.expenses}${queryString(params)}`,
    { signal },
  );
}

export async function listAllExpenses(signal?: AbortSignal): Promise<ExpenseRow[]> {
  const rows: ExpenseRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listExpenses({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data.map(mapExpense));
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function createExpense(payload: {
  categoryId: string;
  amount: number;
  paymentMethod?: string;
  description: string;
  expenseDate?: string | null;
}) {
  return apiRequest<ExpenseResponse>(API_ROUTES.expenses, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(mapExpense);
}

export function listTransactions(
  params: {
    page?: number;
    perPage?: number;
    branchId?: string;
    direction?: string;
    type?: string;
  } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<MoneyTransactionResponse>>(
    `${API_ROUTES.transactions}${queryString(params)}`,
    { signal },
  );
}

export async function listAllTransactions(signal?: AbortSignal): Promise<MoneyTxnRow[]> {
  const rows: MoneyTxnRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listTransactions({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data.map(mapTransaction));
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function reportsDashboard(signal?: AbortSignal) {
  return apiRequest<DashboardReport>(API_ROUTES.reportsDashboard, { signal });
}

export function reportsAnalytics(
  params: { from?: string; to?: string } = {},
  signal?: AbortSignal,
) {
  return apiRequest<AnalyticsReport>(
    `${API_ROUTES.reportsAnalytics}${queryString(params)}`,
    { signal },
  );
}

export function getLocalizationSettings(signal?: AbortSignal) {
  return apiRequest<Record<string, unknown>>(API_ROUTES.settingsLocalization, { signal });
}

export function updateLocalizationSettings(payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(API_ROUTES.settingsLocalization, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getReceiptSettings(signal?: AbortSignal) {
  return apiRequest<Record<string, unknown>>(API_ROUTES.settingsReceipt, { signal });
}

export function updateReceiptSettings(payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(API_ROUTES.settingsReceipt, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getProfileSettings(signal?: AbortSignal) {
  return apiRequest<Record<string, unknown>>(API_ROUTES.settingsProfile, { signal });
}

export function updateProfileSettings(payload: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>(API_ROUTES.settingsProfile, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function syncStatus(signal?: AbortSignal) {
  return apiRequest<{ enabled: boolean }>(API_ROUTES.syncStatus, { signal });
}
