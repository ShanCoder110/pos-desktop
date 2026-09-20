import type { ColumnOption } from "@/components/common/ColumnPicker";

export const SUPPLIER_TAB_SUPPLIERS = "suppliers";
export const SUPPLIER_TAB_LEDGER = "ledger";

export const SUPPLIER_TABS = [
  { id: SUPPLIER_TAB_SUPPLIERS, label: "Suppliers" },
  { id: SUPPLIER_TAB_LEDGER, label: "Supplier ledger" },
] as const;

export const SUPPLIER_STATUS_ACTIVE = "Active";
export const SUPPLIER_STATUS_INACTIVE = "Inactive";
export const SUPPLIER_BALANCE_PAYABLE = "Payable";
export const SUPPLIER_BALANCE_ADVANCE = "Advance";
export const SUPPLIER_BALANCE_SETTLED = "Settled";

export const SUPPLIER_TABLE_COLUMNS: ColumnOption[] = [
  { id: "name", label: "Name" },
  { id: "phone", label: "Phone" },
  { id: "address", label: "Address" },
  { id: "city", label: "City" },
  { id: "balance", label: "Balance" },
];

export const SUPPLIER_LEDGER_COLUMNS: ColumnOption[] = [
  { id: "occurredAt", label: "When" },
  { id: "supplier", label: "Supplier" },
  { id: "type", label: "Type" },
  { id: "debit", label: "Debit" },
  { id: "credit", label: "Credit" },
  { id: "balance", label: "Balance after" },
  { id: "notes", label: "Notes" },
];

export const SUPPLIER_FILTER_FIELDS: {
  id: string;
  label: string;
  options?: string[];
  placeholder?: string;
  numeric?: boolean;
}[] = [
  { id: "name", label: "Name" },
  { id: "phone", label: "Phone" },
  { id: "address", label: "Address" },
  {
    id: "balance",
    label: "Balance",
    options: [SUPPLIER_BALANCE_PAYABLE, SUPPLIER_BALANCE_ADVANCE, SUPPLIER_BALANCE_SETTLED],
  },
  { id: "status", label: "Status", options: [SUPPLIER_STATUS_ACTIVE, SUPPLIER_STATUS_INACTIVE] },
];

export const SUPPLIER_LEDGER_TYPES = [
  "OPENING_BALANCE",
  "PURCHASE",
  "PAYMENT_MADE",
  "PAYMENT_RECEIVED",
  "ADJUSTMENT",
] as const;

export function supplierLedgerTypeLabel(type: string) {
  if (type === "OPENING_BALANCE" || type === "OPENING") return "Opening balance";
  if (type === "PAYMENT_MADE") return "Payment made";
  if (type === "PAYMENT_RECEIVED") return "Payment received";
  if (type === "PURCHASE") return "Purchase";
  if (type === "ADJUSTMENT") return "Adjustment";
  if (type === "SALE") return "Sale";
  return type.replace(/_/g, " ");
}

export const SUPPLIER_LEDGER_FILTER_FIELDS: {
  id: string;
  label: string;
  options?: string[];
  placeholder?: string;
  numeric?: boolean;
}[] = [
  { id: "supplier", label: "Supplier" },
  { id: "entryType", label: "Type", options: [...SUPPLIER_LEDGER_TYPES] },
  { id: "debit", label: "Debit", placeholder: "Minimum debit", numeric: true },
  { id: "credit", label: "Credit", placeholder: "Minimum credit", numeric: true },
  {
    id: "balance",
    label: "Balance after",
    options: [SUPPLIER_BALANCE_PAYABLE, SUPPLIER_BALANCE_ADVANCE, SUPPLIER_BALANCE_SETTLED],
  },
  { id: "notes", label: "Notes" },
];

export const SUPPLIER_SEARCH_PLACEHOLDER = "Search suppliers by name or phone";
export const SUPPLIER_LEDGER_SEARCH_PLACEHOLDER = "Search ledger by supplier, type, or notes";

export const SUPPLIER_OPENING_WE_OWE = "we-owe";
export const SUPPLIER_OPENING_THEY_OWE = "they-owe";

export const SUPPLIER_COPY = {
  title: "Suppliers",
  hint: "Contacts for purchases and lots. Balance is what the shop owes the supplier.",
  added: "Supplier added",
  updated: "Supplier updated",
  removed: "Supplier removed",
  saveFailed: "Could not save supplier",
  removeFailed: "Could not remove supplier",
  nameRequired: "Enter the supplier name",
  phoneInvalid: "Enter 11 digits starting with 03.",
  openingLabel: "Opening balance",
  payable: SUPPLIER_BALANCE_PAYABLE,
  advance: SUPPLIER_BALANCE_ADVANCE,
  payableHint: "Unpaid stock already received",
  advanceHint: "Money already paid to this supplier",
  openingAmount: "Amount",
  openingNone: "No opening balance",
  payableSummary: "This amount is payable to the supplier",
  advanceSummary: "This amount is advance with the supplier",
  payableKpiHint: "Shop must pay",
  advanceKpiHint: "Prepaid with supplier",
  ledgerBalanceHint: "From the supplier ledger",
  ledgerColumnsHint:
    "Debit adds payable. Credit reduces payable or records advance. Payable is the balance after each row.",
  ledgerDebitColumn: "Debit",
  ledgerDebitHint: "Adds payable",
  ledgerCreditColumn: "Credit",
  ledgerCreditHint: "Reduces payable",
  ledgerEmpty: "No data found",
  adjustTitle: "Adjust balance",
  adjustSaved: "Balance adjusted",
  adjustFailed: "Could not adjust balance",
  adjustCurrentBalance: "Current balance",
  adjustBalanceLabel: "Balance",
  adjustBalanceAfter: "Balance after",
  adjustUnchanged: "Change the balance to adjust",
  adjustHint: "Set the new balance. Payable is what you owe; Advance is prepaid credit.",
  adjustPayable: SUPPLIER_BALANCE_PAYABLE,
  adjustAdvance: SUPPLIER_BALANCE_ADVANCE,
  adjustNotes: "Reason",
  adjustNotesRequired: "Enter a reason for the adjustment",
  payTitle: "Record payment",
  paySupplier: "Pay supplier",
  receiveFromSupplier: "Receive from supplier",
  payOutHint: "Cash leaves the shop to clear payable",
  payInHint: "Cash received against supplier advance",
  paySaved: "Payment recorded",
  payFailed: "Could not record payment",
  ledgerTotals: "Totals (filtered)",
  detailTitle: "Supplier details",
  detailSubtitle: "View and manage supplier information and balance.",
  detailReferenceLabel: "Supplier ID",
  contactSection: "Contact information",
  statusActiveHint: "Supplier can be used",
  statusInactiveHint: "Hidden from purchases",
  noPhoneHint: "No phone added",
  noAddressHint: "No address added",
  paySupplierAction: "Record a payment",
  adjustBalanceAction: "Set a new balance",
  viewLedgerAction: "See all transactions",
  editSupplierAction: "Update information",
  viewLedger: "View full ledger",
} as const;

/** Roles allowed to post manual balance adjustments. */
export const SUPPLIER_ADJUST_ROLES = new Set(["OWNER", "MANAGER"]);

export function supplierCanAdjust(role?: string | null) {
  return Boolean(role && SUPPLIER_ADJUST_ROLES.has(role));
}

export function supplierLedgerDebitClass(entryType: string, amount: number) {
  if (!amount) return "";
  if (entryType === "PAYMENT_RECEIVED") return "ledger-amount is-in";
  if (entryType === "PURCHASE" || entryType === "OPENING_BALANCE" || entryType === "OPENING") {
    return "ledger-amount is-owe";
  }
  return "ledger-amount is-neutral";
}

export function supplierLedgerCreditClass(entryType: string, amount: number) {
  if (!amount) return "";
  if (entryType === "PAYMENT_MADE" || entryType === "PAYMENT") return "ledger-amount is-out";
  if (entryType === "ADJUSTMENT") return "ledger-amount is-neutral";
  return "ledger-amount is-neutral";
}
