import type { ProductionRow, ProductionStatus } from "@/shared/domain/types";
import { API_ROUTES } from "@/shared/constants/api";
import { MAX_PAGE_SIZE } from "@/shared/constants/config";
import { apiRequest, queryString, type PaginatedResponse } from "@/services/api";

export interface ProductionMaterialResponse {
  id: string;
  componentProductId: string;
  componentUnitId: string;
  expectedQuantity: number;
  expectedBaseQuantity: number;
  actualQuantity: number;
  actualBaseQuantity: number;
  wasteBaseQuantity: number;
  actualFifoCost: number;
  wasteCost: number;
}

export interface ProductionResponse {
  id: string;
  productionNumber: string;
  branchId: string;
  finishedProductId: string;
  employeeId: string;
  status: string;
  plannedOutputQuantity: number;
  actualOutputQuantity: number;
  materialCost: number;
  wasteCost: number;
  laborCost: number;
  commissionCost: number;
  totalCost: number;
  costPerOutputBase: number;
  notes?: string | null;
  materials: ProductionMaterialResponse[];
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function mapProduction(row: ProductionResponse): ProductionRow {
  return {
    id: row.id,
    productionNumber: row.productionNumber,
    branchId: row.branchId,
    productId: row.finishedProductId,
    outputQuantity: row.actualOutputQuantity || row.plannedOutputQuantity,
    employeeId: row.employeeId,
    status: (row.status as ProductionStatus) || "PENDING",
    materialCost: row.materialCost,
    damageCost: row.wasteCost,
    commissionAmount: row.commissionCost,
    totalCost: row.totalCost,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    createdBy: row.employeeId,
    items: (row.materials ?? []).map((material) => ({
      productId: material.componentProductId,
      lotId: "",
      quantityUsed: material.actualBaseQuantity,
      quantityDamaged: material.wasteBaseQuantity,
      unitCost: material.actualFifoCost,
    })),
  };
}

export function listProduction(
  params: { page?: number; perPage?: number; branchId?: string; status?: string } = {},
  signal?: AbortSignal,
) {
  return apiRequest<PaginatedResponse<ProductionResponse>>(
    `${API_ROUTES.production}${queryString(params)}`,
    { signal },
  );
}

export async function listAllProduction(signal?: AbortSignal): Promise<ProductionRow[]> {
  const rows: ProductionRow[] = [];
  let page = 1;
  for (;;) {
    const response = await listProduction({ page, perPage: MAX_PAGE_SIZE }, signal);
    rows.push(...response.data.map(mapProduction));
    if (!response.meta.hasNextPage) return rows;
    page += 1;
  }
}
