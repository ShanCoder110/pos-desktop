import type { ColumnOption } from "@/components/common/ColumnPicker";
import { routes } from "@/shared/constants/routes";

export const CUSTOMER_TAB_CUSTOMERS = "customers";
export const CUSTOMER_TAB_LEDGER = "ledger";

export const CUSTOMER_TABS = [
  { id: CUSTOMER_TAB_CUSTOMERS, label: "Customers" },
  { id: CUSTOMER_TAB_LEDGER, label: "Customer ledger" },
] as const;

export const CREDIT_TABS = [
  { id: "all", label: "All" },
  { id: "owe", label: "Owes" },
  { id: "advance", label: "Advance" },
  { id: "settled", label: "Settled" },
] as const;

export const CUSTOMER_CREDIT_ROUTE = routes.credit;

export const CUSTOMER_STATUS_ACTIVE = "Active";
export const CUSTOMER_STATUS_INACTIVE = "Inactive";
export const CUSTOMER_BALANCE_OWES = "Owes";
export const CUSTOMER_BALANCE_ADVANCE = "Advance";
export const CUSTOMER_BALANCE_SETTLED = "Settled";

export const CUSTOMER_TABLE_COLUMNS: ColumnOption[] = [
  { id: "name", label: "Name" },
  { id: "phone", label: "Phone" },
  { id: "address", label: "Address" },
  { id: "city", label: "City" },
  { id: "balance", label: "Balance" },
];

export const CUSTOMER_LEDGER_COLUMNS: ColumnOption[] = [
  { id: "occurredAt", label: "When" },
  { id: "customer", label: "Customer" },
  { id: "type", label: "Type" },
  { id: "debit", label: "Debit" },
  { id: "credit", label: "Credit" },
  { id: "balance", label: "Balance after" },
  { id: "notes", label: "Notes" },
];

export const CUSTOMER_FILTER_FIELDS: {
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
    options: [CUSTOMER_BALANCE_OWES, CUSTOMER_BALANCE_ADVANCE, CUSTOMER_BALANCE_SETTLED],
  },
  { id: "status", label: "Status", options: [CUSTOMER_STATUS_ACTIVE, CUSTOMER_STATUS_INACTIVE] },
];

export const CUSTOMER_LEDGER_TYPES = [
  "OPENING_BALANCE",
  "SALE",
  "PAYMENT_RECEIVED",
  "PAYMENT_MADE",
  "ADJUSTMENT",
] as const;

export function customerLedgerTypeLabel(type: string) {
  if (type === "OPENING_BALANCE" || type === "OPENING") return "Opening balance";
  if (type === "PAYMENT_MADE") return "Payment made";
  if (type === "PAYMENT_RECEIVED") return "Payment received";
  if (type === "ADJUSTMENT") return "Adjustment";
  if (type === "SALE") return "Sale";
  return type.replace(/_/g, " ");
}

export const CUSTOMER_LEDGER_FILTER_FIELDS: {
  id: string;
  label: string;
  options?: string[];
  placeholder?: string;
  numeric?: boolean;
}[] = [
  { id: "customer", label: "Customer" },
  { id: "entryType", label: "Type", options: [...CUSTOMER_LEDGER_TYPES] },
  { id: "debit", label: "Debit", placeholder: "Minimum debit", numeric: true },
  { id: "credit", label: "Credit", placeholder: "Minimum credit", numeric: true },
  {
    id: "balance",
    label: "Balance after",
    options: [CUSTOMER_BALANCE_OWES, CUSTOMER_BALANCE_ADVANCE, CUSTOMER_BALANCE_SETTLED],
  },
  { id: "notes", label: "Notes" },
];

export const CUSTOMER_SEARCH_PLACEHOLDER = "Search customers by name or phone";
export const CUSTOMER_LEDGER_SEARCH_PLACEHOLDER = "Search ledger by customer, type, or notes";

export const CUSTOMER_OPENING_OWES = "owes";
export const CUSTOMER_OPENING_ADVANCE = "advance";

export const CUSTOMER_COPY = {
  title: "Customers",
  hint: "Named customers hold a balance. Walk-in bills never get a ledger. + owes the shop, − is advance.",
  add: "Add customer",
  saved: "Customer saved",
  updated: "Customer updated",
  deleted: "Customer deleted",
  saveFailed: "Could not save customer",
  deleteFailed: "Could not delete this customer",
  nameRequired: "Enter the customer name",
  phoneInvalid: "Enter 11 digits starting with 03.",
  openingLabel: "Opening balance",
  owes: CUSTOMER_BALANCE_OWES,
  advance: CUSTOMER_BALANCE_ADVANCE,
  owesHint: "Unpaid balance carried in",
  advanceHint: "Prepaid amount held for the next bill",
  openingNone: "No opening balance",
  owesSummary: "Customer owes this amount",
  advanceSummary: "Advance held for the next bill",
  owesKpiHint: "Customers who owe",
  advanceKpiHint: "Held for next bill",
  ledgerBalanceHint: "From the customer ledger",
  ledgerColumnsHint:
    "Debit adds what they owe. Credit reduces balance or records advance. Owes is the balance after each row.",
  ledgerDebitColumn: "Debit",
  ledgerDebitHint: "Adds owes",
  ledgerCreditColumn: "Credit",
  ledgerCreditHint: "Reduces owes",
  ledgerEmpty: "No data found",
  adjustTitle: "Adjust balance",
  adjustSaved: "Balance adjusted",
  adjustFailed: "Could not adjust balance",
  adjustCurrentBalance: "Current balance",
  adjustBalanceLabel: "Balance",
  adjustBalanceAfter: "Balance after",
  adjustUnchanged: "Change the balance to adjust",
  adjustHint: "Set the new balance. Owes is what they owe; Advance is prepaid credit.",
  adjustOwes: CUSTOMER_BALANCE_OWES,
  adjustAdvance: CUSTOMER_BALANCE_ADVANCE,
  adjustNotes: "Reason",
  payTitle: "Record payment",
  collectPayment: "Collect payment",
  refundAdvance: "Refund advance",
  collectHint: "Cash received against customer balance",
  refundHint: "Cash paid out against customer advance",
  paySaved: "Payment recorded",
  payFailed: "Could not record payment",
  ledgerTotals: "Totals (filtered)",
  detailTitle: "Customer details",
  detailSubtitle: "View and manage customer information and balance.",
  detailReferenceLabel: "Customer ID",
  contactSection: "Contact information",
  statusActiveHint: "Customer can be billed",
  statusInactiveHint: "Hidden from sales",
  noPhoneHint: "No phone added",
  noAddressHint: "No address added",
  collectPaymentAction: "Record a payment",
  adjustBalanceAction: "Set a new balance",
  viewLedgerAction: "See all transactions",
  editCustomerAction: "Update information",
  viewLedger: "View full ledger",
  totalShopping: "Total shopping",
  creditSales: "Credit sales",
  largestBalances: "Largest balances",
  largestBalancesSubtitle: "Customers who owe the shop",
  pageSubtitle: "Named buyers with a balance",
} as const;

export const CREDIT_COPY = {
  title: "Customer credit",
  hint: "+ balance = customer owes. 0 = settled. − balance = advance on the next bill. Walk-in invoices never hit this ledger.",
  owedToShop: "Owed to shop",
  owingCount: "Owing",
  advanceHeld: "Advance",
  settled: "Settled",
  collectHint: "Collect",
  customersHint: "Customers",
  advanceHint: "Held for next bill",
  zeroBalanceHint: "Zero balance",
} as const;

export const CUSTOMER_PLACEHOLDERS = {
  search: "Search name, phone, or address",
  name: "Enter name",
  phone: "0300 1234567",
  address: "Enter address",
  amount: "Enter amount",
} as const;

export const CUSTOMER_PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank" },
] as const;

/** Roles allowed to post manual balance adjustments. */
export const CUSTOMER_ADJUST_ROLES = new Set(["OWNER", "MANAGER"]);

export function customerCanAdjust(role?: string | null) {
  return Boolean(role && CUSTOMER_ADJUST_ROLES.has(role));
}

export function customerLedgerDebitClass(entryType: string, amount: number) {
  if (!amount) return "";
  if (entryType === "PAYMENT_MADE") return "ledger-amount is-out";
  if (entryType === "SALE" || entryType === "OPENING_BALANCE" || entryType === "OPENING") {
    return "ledger-amount is-owe";
  }
  return "ledger-amount is-neutral";
}

export function customerLedgerCreditClass(entryType: string, amount: number) {
  if (!amount) return "";
  if (entryType === "PAYMENT_RECEIVED" || entryType === "PAYMENT") return "ledger-amount is-in";
  if (entryType === "ADJUSTMENT") return "ledger-amount is-neutral";
  return "ledger-amount is-neutral";
}
