import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface RepairPartResponse {
  id: string;
  productId: string;
  productUnitId: string;
  displayedQuantity: number;
  baseQuantity: number;
  wasteBaseQuantity: number;
  sellingPrice: number;
  lineTotal: number;
  fifoCost: number;
  wasteCost: number;
}

export interface RepairResponse {
  id: string;
  branchId: string;
  repairNumber: string;
  customerId?: string | null;
  assignedEmployeeId?: string | null;
  itemName: string;
  complaint: string;
  serialNumber?: string | null;
  diagnosis?: string | null;
  workNotes?: string | null;
  status: string;
  paymentStatus: string;
  estimatedAmount: number;
  serviceAmount: number;
  partsAmount: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  creditAmount: number;
  materialCost: number;
  wasteCost: number;
  commissionCost: number;
  parts: RepairPartResponse[];
  receivedAt: string;
  readyAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listRepairs(
  params: { page?: number; perPage?: number; branchId?: string; status?: string } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<RepairResponse>>(`${API_ROUTES.repairs}${queryString(params)}`, {
    signal,
  });
}

export async function listAllRepairs(signal?: AbortSignal): Promise<RepairResponse[]> {
  const rows: RepairResponse[] = [];
  let page = 1;
  for (;;) {
    const response = await listRepairs({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data);
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}
