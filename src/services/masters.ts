import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface MasterRecord {
  id: string;
  name: string;
  symbol?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  precision?: number;
  balance?: number;
  isWalkIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MasterPayload {
  name: string;
  symbol?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
  precision?: number;
  isWalkIn?: boolean;
  previousBalance?: number;
}

export type MasterResource = "categories" | "units" | "suppliers" | "customers";

export type MasterListParams = {
  page?: number;
  perPage?: number;
  search?: string;
  isActive?: boolean;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  balance?: string;
};

const pathFor = (resource: MasterResource) => API_ROUTES[resource];

export function listMasterRecords(
  resource: MasterResource,
  params: MasterListParams = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<MasterRecord>>(`${pathFor(resource)}${queryString(params)}`, {
    signal,
  });
}

export async function listAllMasterRecords(
  resource: MasterResource,
  params: Omit<MasterListParams, "page" | "perPage"> = {},
  signal?: AbortSignal,
) {
  const records: MasterRecord[] = [];
  let page = 1;
  for (;;) {
    const response = await listMasterRecords(
      resource,
      { ...params, page, perPage: MAX_PAGE_SIZE },
      signal,
    );
    records.push(...response.data);
    if (!response.meta.hasNextPage) return records;
    page += 1;
  }
}

export function getMasterRecord(resource: MasterResource, id: string, signal?: AbortSignal) {
  return apiRequest<MasterRecord>(`${pathFor(resource)}/${encodeURIComponent(id)}`, { signal });
}

export function createMasterRecord(resource: MasterResource, payload: MasterPayload) {
  return apiRequest<MasterRecord>(pathFor(resource), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMasterRecord(resource: MasterResource, id: string, payload: MasterPayload) {
  return apiRequest<MasterRecord>(`${pathFor(resource)}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteMasterRecord(resource: MasterResource, id: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `${pathFor(resource)}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
