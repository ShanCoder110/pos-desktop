export type PosDiscountMode = "rs" | "pct";

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
