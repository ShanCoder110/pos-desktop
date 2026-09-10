import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";
import type { Branch, BranchSetting, StaffUser, UserRole } from "@/shared/domain/types";

export interface BranchResponse {
  id: string;
  name: string;
  code: string;
  type: string;
  phone?: string | null;
  address?: string | null;
  isMain: boolean;
  isActive: boolean;
  settings?: {
    id: string;
    branchId: string;
    allowNegativeStock: boolean;
    requireConfirmedCrossBranchTransfer: boolean;
    fifoEnabled: boolean;
    defaultWalkInCustomerId?: string | null;
    invoicePrefix: string;
    repairPrefix: string;
    productionPrefix: string;
    lotPrefix: string;
    skuPrefix: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserResponse {
  id: string;
  name: string;
  username: string;
  phone?: string | null;
  email?: string | null;
  role: string;
  defaultBranchId?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  permissions: { id: string; permissionKey: string; isAllowed: boolean }[];
  createdAt: string;
  updatedAt: string;
}

export interface DeviceResponse {
  id: string;
  branchId: string;
  name: string;
  isActive: boolean;
  lastSeenAt?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapBranch(row: BranchResponse): Branch {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: (row.type as Branch["type"]) || "STORE",
    phone: row.phone ?? "",
    address: row.address ?? "",
    isActive: row.isActive,
  };
}

export function mapBranchSetting(row: BranchResponse): BranchSetting | null {
  if (!row.settings) return null;
  return {
    id: row.settings.id,
    branchId: row.settings.branchId,
    branchLotEnabled: true,
    allowNegativeStock: row.settings.allowNegativeStock,
  };
}

export function mapUser(row: UserResponse): StaffUser {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: (row.role as UserRole) || "CASHIER",
    branchId: row.defaultBranchId ?? "",
    phone: row.phone ?? "",
    isActive: row.isActive,
  };
}

export function listBranches(
  params: { page?: number; perPage?: number } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<BranchResponse>>(
    `${API_ROUTES.branches}${queryString(params)}`,
    { signal },
  );
}

export async function listAllBranches(signal?: AbortSignal): Promise<BranchResponse[]> {
  const rows: BranchResponse[] = [];
  let page = 1;
  for (;;) {
    const response = await listBranches({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function listUsers(
  params: { page?: number; perPage?: number; search?: string } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<UserResponse>>(
    `${API_ROUTES.users}${queryString(params)}`,
    { signal },
  );
}

export async function listAllUsers(signal?: AbortSignal): Promise<UserResponse[]> {
  const rows: UserResponse[] = [];
  let page = 1;
  for (;;) {
    const response = await listUsers({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}

export function listDevices(signal?: AbortSignal) {
  return apiRequest<DeviceResponse[] | PaginatedResponse<DeviceResponse>>(
    API_ROUTES.devices,
    { signal },
  ).then((payload) => (Array.isArray(payload) ? payload : payload.data ?? []));
}
