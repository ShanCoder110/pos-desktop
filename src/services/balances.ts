import { apiRequest } from "@/services/api";
import { API_ROUTES } from "@/shared/constants/api";

export async function adjustSupplierBalance(id: string, amount: number, notes: string) {
  return apiRequest<{ balanceAfter: number }>(API_ROUTES.supplierAdjustBalance(id), {
    method: "POST",
    body: JSON.stringify({ amount, notes }),
  });
}

export async function adjustCustomerBalance(id: string, amount: number, notes: string) {
  return apiRequest<{ balanceAfter: number }>(API_ROUTES.customerAdjustBalance(id), {
    method: "POST",
    body: JSON.stringify({ amount, notes }),
  });
}
