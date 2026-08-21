export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Bare amount for POS ticket / tables */
export function moneyNum(n: number) {
  return Math.abs(n).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Amount with Rs for lists and messages */
export function money(n: number) {
  return `Rs ${moneyNum(n)}`;
}

export function signedMoney(n: number) {
  if (n === 0) return money(0);
  return n < 0 ? `−${money(-n)}` : money(n);
}

export function qty(n: number, unit: string) {
  const value = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${value} ${unit}`;
}

export function today() {
  return "2026-08-13";
}

export type BalanceTone = "owe" | "advance" | "settled";

export function balanceMeta(n: number): { text: string; tone: BalanceTone } {
  if (n < 0) return { text: `Owes ${money(-n)}`, tone: "owe" };
  if (n > 0) return { text: `Advance ${money(n)}`, tone: "advance" };
  return { text: "Settled", tone: "settled" };
}
