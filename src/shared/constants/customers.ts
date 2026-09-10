import { routes } from "@/shared/constants/routes";

export const CUSTOMER_TABS = [
  { id: "all", label: "All" },
  { id: "owe", label: "Owes" },
  { id: "advance", label: "Advance" },
  { id: "over", label: "Over limit" },
  { id: "inactive", label: "Inactive" },
] as const;

export const CUSTOMER_COPY = {
  title: "Customers",
  hint: "Named customers hold khata. Walk-in bills never get a ledger. + owes the shop, − is advance.",
  add: "Add customer",
  credit: "Open khata",
  empty: "No customers match this filter.",
  saved: "Customer saved",
  deleted: "Customer deleted",
  paid: "Payment recorded",
  nameRequired: "Enter a name",
  saveFailed: "Could not save customer",
  deleteFailed: "Could not delete this customer",
  payFailed: "Could not record payment",
} as const;

export const CUSTOMER_PLACEHOLDERS = {
  search: "Search name, phone, or address",
  name: "Enter name",
  phone: "Enter phone",
  address: "Enter address",
  creditLimit: "Enter credit limit",
  amount: "Enter amount",
} as const;

export const CUSTOMER_PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank" },
] as const;

export const CUSTOMER_CREDIT_ROUTE = routes.credit;
