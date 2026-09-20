import type { SupplierRow } from "@/shared/domain/types";

export type HubSupplier = {
  id: string;
  name: string;
  isActive: boolean;
  cityId?: string | null;
  cityName?: string | null;
};

export function mergeHubSuppliers(
  suppliers: HubSupplier[],
  supplierRows: SupplierRow[] = [],
): HubSupplier[] {
  const map = new Map<string, HubSupplier>();
  for (const row of suppliers) map.set(row.id, row);
  for (const row of supplierRows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      cityId: row.cityId,
      cityName: row.cityName,
    });
  }
  return [...map.values()];
}

export function supplierLabel(
  supplierId: string,
  suppliers: HubSupplier[],
  supplierRows: SupplierRow[] = [],
) {
  return (
    mergeHubSuppliers(suppliers, supplierRows).find((row) => row.id === supplierId)?.name ??
    supplierId
  );
}

export function supplierCityName(
  supplierId: string,
  suppliers: HubSupplier[],
  supplierRows: SupplierRow[] = [],
) {
  return (
    mergeHubSuppliers(suppliers, supplierRows)
      .find((row) => row.id === supplierId)
      ?.cityName?.trim() ?? ""
  );
}

export function hubCityOptions(suppliers: HubSupplier[], supplierRows: SupplierRow[] = []) {
  const names = new Set<string>();
  for (const row of mergeHubSuppliers(suppliers, supplierRows)) {
    const name = row.cityName?.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function hubSupplierOptions(suppliers: HubSupplier[], supplierRows: SupplierRow[] = []) {
  return mergeHubSuppliers(suppliers, supplierRows)
    .map((row) => row.name)
    .sort((a, b) => a.localeCompare(b));
}
