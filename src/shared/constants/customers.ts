import type { ColumnOption } from "@/components/common/ColumnPicker";
import { routes } from "@/shared/constants/routes";

export const CUSTOMER_TAB_CUSTOMERS = "customers";
export const CUSTOMER_TAB_LEDGER = "ledger";

export const CUSTOMER_TABS = [
  { id: CUSTOMER_TAB_CUSTOMERS, label: "Customers" },
  { id: CUSTOMER_TAB_LEDGER, label: "Customer ledger" },
] as const;

export const CREDIT_TAB_BOOKS = "credit-books";
export const CREDIT_TAB_LEDGER = "ledger";

export const CREDIT_TABS = [
  { id: CREDIT_TAB_BOOKS, label: "Credit books" },
  { id: CREDIT_TAB_LEDGER, label: "Ledger" },
] as const;

export const CUSTOMER_CREDIT_ROUTE = routes.credit;

export function creditCustomerHref(customerId: string) {
  return `${routes.credit}/${encodeURIComponent(customerId)}`;
}

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

export const CREDIT_TABLE_COLUMNS: ColumnOption[] = [
  { id: "name", label: "Customer" },
  { id: "phone", label: "Phone" },
  { id: "openSales", label: "Open sales" },
  { id: "balance", label: "Balance" },
  { id: "profitHold", label: "Profit on hold" },
  { id: "creditTotal", label: "Credit total" },
  { id: "collected", label: "Collected" },
  { id: "lastSale", label: "Last credit sale" },
  { id: "address", label: "Address" },
];

export const CREDIT_DEFAULT_COLUMNS = ["name", "phone", "openSales", "balance"];

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
  title: "Credit sales",
  hint: "Add a customer to the credit book, open their page, then record products they took on credit. Balance updates from each credit sale and payment.",
  customerBook: "Customers book",
  addBook: "Add to book",
  addBookSaved: "Customer added to credit book",
  addBookFailed: "Could not add customer to credit book",
  viewProducts: "Open credit sales",
  backToBook: "Back to customers book",
  newCreditSale: "New credit sale",
  newCreditSaleSubtitle:
    "Add products the customer took on credit. Stock is reduced and their balance increases (Owes).",
  creditSalesFor: "Credit sales for",
  noCreditSales: "No data found",
  noBookCustomers: "No customers in the credit book yet.",
  noBookMatch: "No matching credit records found.",
  saleSaved: "Credit sale recorded",
  saleFailed: "Could not record credit sale",
  addLine: "Add line",
  linesRequired: "Add at least one product line",
  productRequired: "Choose a product",
  selectProduct: "Choose product",
  tabCreditSales: "Credit sales",
  tabInvoices: "Invoices",
  tabLedger: "Ledger",
  creditSold: "Sold on credit",
  creditSoldHint: "credit sale product(s)",
  paidOnCredit: "Paid on credit",
  paidOnCreditHint: "Collected against credit sales",
  paymentNote:
    "Payment reduces the customer balance and knocks off open credit sales in FIFO order.",
  owedToShop: "Owed to shop",
  owingCount: "Owing",
  advanceHeld: "Advance",
  settled: "Settled",
  collectHint: "Collect",
  customersHint: "Customers",
  advanceHint: "Held for next bill",
  zeroBalanceHint: "Zero balance",
  editCustomer: "Edit",
  moveToTrash: "Move to Trash",
  trashConfirmTitle: "Move customer to Trash?",
  trashMoved: "moved to Trash.",
  trashFailed: "Could not move this customer to Trash.",
  customerUpdated: "Customer updated.",
  customerUpdateFailed: "Could not update this customer.",
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
