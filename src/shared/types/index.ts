export type StockPick = "oldest" | "newest" | "ask";
export type PrintSize = "thermal" | "a4";
export type BranchKind = "retail" | "repair";
export type Unit = "pc" | "m";
export type InvoiceStatus = "paid" | "partial" | "credit" | "held";
export type RepairStatus = "open" | "done" | "delivered";
export type ReturnKind = "refund" | "exchange" | "claim" | "damage";
export type TxnKind =
  | "sale"
  | "credit"
  | "purchase"
  | "expense"
  | "salary"
  | "return"
  | "repair";

export interface ShopSettings {
  shopName: string;
  footer: string;
  showBalanceOnSlip: boolean;
  printSize: PrintSize;
  autoPrint: boolean;
  autoSku: boolean;
  minPriceRule: boolean;
  stockPick: StockPick;
  defaultTax: number;
  defaultDiscount: number;
  isMainServer: boolean;
}

export interface Shop {
  id: string;
  name: string;
  kind: BranchKind;
  city: string;
  isMain: boolean;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  salary: number;
  paidThisMonth: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number;
  isWalking: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  payable: number;
}

export type WarrantyUnit = "months" | "days";

export interface BomLine {
  id: string;
  productId: string;
  quantity: number;
  unitId?: string;
  baseQuantity?: number;
}

export interface ProductSellUnit {
  id: string;
  name: string;
  symbol?: string;
  kind?: "base" | "bigger" | "smaller" | "pack" | "small";
  contains: number;
  cost: number;
  min: number;
  wholesale: number;
  price: number;
  barcode: string;
  priceManual?: {
    cost?: boolean;
    min?: boolean;
    wholesale?: boolean;
    price?: boolean;
  };
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  unit: string;
  supplierId?: string;
  minimumStock?: number;
  isLinear: boolean;
  isManufactured: boolean;
  packQty: number | null;
  packPrice: number;
  cost: number;
  min: number;
  wholesale: number;
  retail: number;
  warrantyEnabled?: boolean;
  warrantyQty: number;
  warrantyUnit: WarrantyUnit;
  warrantyDays: number;
  warrantyNote?: string;
  claims: number;
  damaged: number;
  stock: number;
  components: BomLine[];
  sellUnits?: ProductSellUnit[];
}

export interface Lot {
  id: string;
  productId: string;
  supplierId: string;
  branchId: string;
  receivedOn: string;
  qtyIn: number;
  qtyLeft: number;
  cost: number;
  min: number;
  wholesale: number;
  retail: number;
}

export interface InvoiceLine {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  minFloor: number;
  lotsNote: string;
}

export interface Invoice {
  id: string;
  no: string;
  date: string;
  time: string;
  customerId: string;
  lines: InvoiceLine[];
  total: number;
  paid: number;
  balanceBefore: number;
  balanceAfter: number;
  status: InvoiceStatus;
}

export interface CreditSale {
  id: string;
  no: string;
  date: string;
  customerId: string;
  lines: InvoiceLine[];
  total: number;
}

export interface RepairJob {
  id: string;
  no: string;
  date: string;
  customerId: string;
  item: string;
  status: RepairStatus;
  parts: InvoiceLine[];
  labour: number;
  employeeId: string;
  commission: number;
}

export interface ReorderLine {
  id: string;
  productId: string;
  supplierId: string;
  qty: number;
  cost: number;
  received: boolean;
}

export interface Expense {
  id: string;
  date: string;
  title: string;
  amount: number;
}

export interface MoneyTxn {
  id: string;
  date: string;
  kind: TxnKind;
  party: string;
  inflow: number;
  outflow: number;
  note: string;
}

export interface ReturnTicket {
  id: string;
  date: string;
  customerId: string;
  productId: string;
  qty: number;
  kind: ReturnKind;
  supplierId: string;
}

export interface HeldBill {
  id: string;
  label: string;
  customerId: string;
  lines: InvoiceLine[];
  at: string;
}

export interface ShopProfile {
  name: string;
  address: string;
}

export interface OwnerProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
}

export interface AuthSession {
  shop: ShopProfile | null;
  owner: OwnerProfile | null;
  loggedIn: boolean;
}
