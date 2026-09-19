import { apiRequest } from "@/services/api";
import { API_ROUTES } from "@/shared/constants/api";

export type TrashItem = {
  id: string;
  name: string;
  deletedAt: string;
  deletedBy?: string;
};

export async function listTrash(entity: "suppliers" | "customers" | "users", signal?: AbortSignal) {
  return apiRequest<TrashItem[]>(`${API_ROUTES.trash}?entity=${entity}`, { signal });
}

export async function restoreTrash(entity: string, id: string) {
  return apiRequest<void>(API_ROUTES.trashRestore(entity, id), { method: "POST" });
}

export async function purgeTrash(entity: string, id: string) {
  return apiRequest<void>(API_ROUTES.trashPurge(entity, id), { method: "POST" });
}
