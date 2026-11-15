export type PosDiscountMode = "rs" | "pct";

type DiscountLine = {
  priceMode: string;
  listPrice: number;
  minPrice: number;
  unitPrice: number;
  qty: number;
};

function discountReference(line: DiscountLine, wholesaleBelowMinimumOnly: boolean) {
  return wholesaleBelowMinimumOnly && line.priceMode === "wholesale"
    ? Math.min(line.listPrice, line.minPrice)
    : line.listPrice;
}

export function priceForLineDiscount(
  line: DiscountLine,
  discount: number,
  wholesaleBelowMinimumOnly: boolean,
) {
  // Clearing an already-empty discount must preserve an agreed price above minimum.
  if (discount <= 0 && posLineDiscount(line, wholesaleBelowMinimumOnly) === 0)
    return line.unitPrice;
  return +Math.max(
    0,
    discountReference(line, wholesaleBelowMinimumOnly) -
      Math.max(0, discount) / Math.max(0.001, line.qty),
  ).toFixed(2);
}

export function posLineDiscount(line: DiscountLine, wholesaleBelowMinimumOnly: boolean) {
  const reference = discountReference(line, wholesaleBelowMinimumOnly);
  return +(Math.max(0, reference - line.unitPrice) * line.qty).toFixed(2);
}

export function convertBillDiscount(
  nextMode: PosDiscountMode,
  afterLineTotal: number,
  amount: number,
  percent: number,
) {
  const safeTotal = Math.max(0, afterLineTotal);
  if (nextMode === "pct") {
    return {
      amount: Math.max(0, amount),
      percent:
        safeTotal > 0 ? +Math.min(100, (Math.max(0, amount) / safeTotal) * 100).toFixed(2) : 0,
    };
  }
  return {
    amount: +((safeTotal * Math.min(100, Math.max(0, percent))) / 100).toFixed(2),
    percent: Math.max(0, percent),
  };
}

export function paymentStatusLabel({
  paid,
  unpaid,
  extra,
  returnChange,
}: {
  paid: number;
  unpaid: number;
  extra: number;
  returnChange: boolean;
}) {
  if (paid <= 0.001) return "Unpaid";
  if (unpaid > 0.001) return "Partially paid";
  if (extra > 0.001) return returnChange ? "Paid · change due" : "Paid · extra to balance";
  return "Paid";
}

/** F11 / switch-all wholesale toast. `fallbackCount` = lines that kept retail. */
export function wholesaleCartToast(fallbackCount: number): string {
  if (fallbackCount <= 0) return "All items wholesale";
  const n = fallbackCount;
  const noun = n === 1 ? "item" : "items";
  return `Wholesale applied; ${n} ${noun} kept retail (no wholesale price)`;
}
