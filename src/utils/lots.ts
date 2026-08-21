import type { Lot, Product, StockPick } from "@/shared/types";
import { lots, suppliers } from "@/shared/mock";

export type ConsumeResult = {
  price: number;
  minFloor: number;
  lotsNote: string;
  used: { lot: Lot; qty: number }[];
};

export function remainingStock(productId: string) {
  return lots
    .filter((lot) => lot.productId === productId)
    .reduce((sum, lot) => sum + lot.qtyLeft, 0);
}

export function lotsForProduct(productId: string, supplierId?: string) {
  return lots.filter(
    (lot) =>
      lot.productId === productId &&
      lot.qtyLeft > 0 &&
      (!supplierId || lot.supplierId === supplierId),
  );
}

export function consumeLots(
  product: Product,
  qty: number,
  pick: StockPick,
  supplierId?: string,
): ConsumeResult | { error: string } {
  let pool = lotsForProduct(product.id, pick === "ask" ? supplierId : undefined);
  if (pick === "oldest") {
    pool = [...pool].sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
  } else if (pick === "newest") {
    pool = [...pool].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn));
  }

  const shopLeft = remainingStock(product.id);
  if (qty > shopLeft) {
    return { error: `Only ${shopLeft} ${product.unit} left in shop` };
  }
  if (pick === "ask" && !supplierId) {
    return { error: "Pick a supplier first" };
  }

  let need = qty;
  const used: { lot: Lot; qty: number }[] = [];
  for (const lot of pool) {
    if (need <= 0) break;
    const take = Math.min(lot.qtyLeft, need);
    used.push({ lot, qty: take });
    need -= take;
  }
  if (need > 0) {
    return { error: "Not enough in the chosen lots" };
  }

  const price = Math.max(...used.map((u) => u.lot.retail));
  const minFloor = Math.min(...used.map((u) => u.lot.min));
  const lotsNote = used
    .map((u) => {
      const name = suppliers.find((s) => s.id === u.lot.supplierId)?.name ?? "Lot";
      return `${u.qty} from ${name}`;
    })
    .join(" · ");

  return { price, minFloor, lotsNote, used };
}
