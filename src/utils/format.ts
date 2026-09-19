import { FIELD_LIMITS } from "@/shared/constants/fields";
import type { WarrantyUnit } from "@/shared/types";
import { mapApiError } from "@/utils/apiError";

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

/** Signed ledger change for balance-adjust previews (+ Rs … / − Rs …). */
export function adjustDelta(n: number) {
  if (n === 0) return money(0);
  return n > 0 ? `+${money(n)}` : `−${money(-n)}`;
}

/** Absolute balance for editable money fields when correcting a ledger balance. */
export function balanceInputDraft(n: number) {
  if (n === 0) return "";
  return moneyNum(Math.abs(n));
}

/** Short display reference for entity detail drawers (#SUP-0042). */
export function formatEntityRef(prefix: string, id: string) {
  if (!id) return "";
  const seed = id.replace(/-/g, "").slice(0, 8);
  const n = Number.parseInt(seed, 16) % 10000;
  const code = Number.isFinite(n) ? n : 0;
  return `#${prefix}-${String(code).padStart(4, "0")}`;
}

export function formatDetailDate(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function shortError(error: unknown, fallback: string) {
  return mapApiError(error, fallback);
}

export function limitMoneyDraft(raw: string) {
  const [whole = "", fraction] = raw.replace(/[^\d.]/g, "").split(".");
  const integer = whole.slice(0, FIELD_LIMITS.moneyInteger);
  if (fraction === undefined && !raw.includes(".")) return integer;
  return `${integer}.${fraction.slice(0, FIELD_LIMITS.moneyFraction)}`;
}

export function qty(n: number, unit: string) {
  const value = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${value} ${unit}`;
}

export function today() {
  return "2026-08-13";
}

export function warrantyDaysOf(qty: number, unit: WarrantyUnit) {
  if (!qty) return 0;
  return unit === "months" ? qty * 30 : qty;
}

export function creditState(n: number): {
  text: string;
  tone: "ok" | "warn" | "danger" | "neutral";
} {
  if (n > 0) return { text: `Owes ${money(n)}`, tone: "danger" };
  if (n < 0) return { text: `Advance ${money(-n)}`, tone: "ok" };
  return { text: "Settled", tone: "neutral" };
}

export type BalanceTone = "owe" | "advance" | "settled";

export function balanceMeta(n: number): { text: string; tone: BalanceTone } {
  if (n < 0) return { text: `Owes ${money(-n)}`, tone: "owe" };
  if (n > 0) return { text: `Advance ${money(n)}`, tone: "advance" };
  return { text: "Settled", tone: "settled" };
}
