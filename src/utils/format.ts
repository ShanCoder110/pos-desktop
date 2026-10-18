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

/** Receipt amount: omit .00, but retain up to two digits when a real fraction exists. */
export function receiptMoneyNum(n: number) {
  return Math.abs(n).toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function receiptMoney(n: number) {
  return `Rs ${receiptMoneyNum(n)}`;
}

/** Amount with Rs for lists and messages */
export function money(n: number) {
  return `Rs ${moneyNum(n)}`;
}

const LEDGER_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Ledger notes should name the invoice, not a raw id. */
export function ledgerNoteText(notes?: string | null) {
  const text = (notes ?? "").replace(LEDGER_UUID, "").replace(/\s+/g, " ").trim();
  return text || "—";
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

/**
 * Shared local date-only for calendar fields (expiry, received).
 * Example: `17 Oct 2026`
 */
export function formatTableDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Shared local datetime for list/detail timestamps outside the POS sale screen.
 * Example: `17 Oct 2026, 3:40 PM`
 */
export function formatTableDateTime(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = formatTableDate(iso);
  if (day === "—" || day === iso) return day;
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day}, ${time}`;
}

/** Detail drawers — same shared local datetime formatter. */
export function formatDetailDate(iso?: string) {
  return formatTableDateTime(iso);
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
