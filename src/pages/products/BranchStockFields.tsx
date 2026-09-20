import {
  branchStockToLotRows,
  lotRowsToBranchStock,
  mergeBranchStock,
} from "@/pages/products/branchStockUtils";
import { LotBranchFields } from "@/pages/lots/LotBranchFields";
import type { Product, ProductBranchStock } from "@/shared/types";

type BranchRow = { id: string; name: string };

export function ProductBranchAllocation({
  branches,
  rows,
  sessionBranchId,
  totalQuantity,
  unitLabel,
  product,
  onChange,
}: {
  branches: BranchRow[];
  rows: ProductBranchStock[];
  sessionBranchId?: string;
  totalQuantity: number;
  unitLabel: string;
  product?: Product;
  onChange: (rows: ProductBranchStock[]) => void;
}) {
  if (!branches.length) {
    return <p className="m-0 text-[11px] text-muted">Loading branches…</p>;
  }

  const merged = mergeBranchStock(branches, rows);

  return (
    <LotBranchFields
      rows={branchStockToLotRows(merged)}
      sessionBranchId={sessionBranchId}
      receivedQuantity={totalQuantity}
      unitLabel={unitLabel}
      product={product}
      onChange={(lotRows) => onChange(lotRowsToBranchStock(lotRows))}
    />
  );
}
