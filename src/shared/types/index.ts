import type { ReceiptFontFamily } from "@/shared/constants/receiptBranding";

export type StockPick = "oldest" | "newest" | "ask";
export type PrintSize = "thermal" | "a4";
export type PaperWidth = "MM_58" | "MM_80" | "A4";
export type { ReceiptFontFamily };
export type AppLanguage = "EN" | "UR";
export type ReceiptLanguage = "EN" | "UR";
export type ReceiptTextSize = "small" | "medium" | "large";
export type ReceiptTextAlign = "left" | "center" | "right";
export type ReceiptHeaderLayout = "text" | "logo" | "logo_text";
export type BranchKind = "retail" | "repair";
export type Unit = "pc" | "m";
export type InvoiceStatus = "paid" | "partial" | "credit" | "held";
export type RepairStatus = "open" | "done" | "delivered";
export type ReturnKind = "refund" | "exchange" | "claim" | "damage";
export type TxnKind = "sale" | "credit" | "purchase" | "expense" | "salary" | "return" | "repair";

export interface ShopSettings {
  shopName: string;
  legalName: string;
  phone: string;
  email: string;
  address: string;
  footer: string;
  showBalanceOnSlip: boolean;
  printSize: PrintSize;
  autoPrint: boolean;
  autoSku: boolean;
  minPriceRule: boolean;
  stockPick: StockPick;
  creditPriceMode: "WHOLESALE" | "RETAIL";
  defaultTax: number;
  defaultDiscount: number;
  isMainServer: boolean;
  currencySymbol: string;
  currencyCode: string;
  language: AppLanguage;
  expiryReminderDays: number;
  payoutDeductFrom: "PROFIT" | "REVENUE";
  invoicePrefix: string;
  skuPrefix: string;
  lotPrefix: string;
  fifoEnabled: boolean;
  receiptShopName: string;
  paperWidth: PaperWidth;
  showLogo: boolean;
  /** Locally stored data URL used only by this installation for invoice printing. */
  receiptLogoDataUrl: string;
  receiptLogoScale: number;
  receiptHeaderLayout: ReceiptHeaderLayout;
  receiptTextSize: ReceiptTextSize;
  receiptPaymentStatusSize: ReceiptTextSize;
  receiptShopNameSize: ReceiptTextSize;
  receiptShopNameBold: boolean;
  receiptTaglineAlign: ReceiptTextAlign;
  receiptContactAlign: ReceiptTextAlign;
  receiptFooterSize: ReceiptTextSize;
  receiptFooterBold: boolean;
  receiptPromoAlign: ReceiptTextAlign;
  receiptPromoSize: ReceiptTextSize;
  receiptPromoBold: boolean;
  showCashierName: boolean;
  showItemDiscount: boolean;
  receiptLanguage: ReceiptLanguage;
  tagline: string;
  contactLine: string;
  promoUrdu: string;
  /** Slip body font (thermal / courier / arial / times / consolas). */
  receiptFontFamily: ReceiptFontFamily;
  /** Line-item table grid borders on the slip (dukan default off). */
  itemsTableBordered: boolean;
  printerName: string;
  printerPaperWidth: PaperWidth;
  copies: number;
  splitLongBill: boolean;
  /** Products on first cut slip when split is on (dukan default 12). */
  splitFirstPageItems: number;
  /** Products on middle continuation slips (dukan default 15). */
  splitMiddlePageItems: number;
  /** Products on last slip with totals (dukan default 12). */
  splitLastPageItems: number;
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
  address?: string;
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

export interface ProductBranchStock {
  branchId: string;
  branchName: string;
  quantity: number;
}

export interface ProductSellUnit {
  id: string;
  name: string;
  symbol?: string;
  kind?: "base" | "bigger" | "smaller" | "pack" | "small";
  isBase?: boolean;
  isDefault?: boolean;
  /** divide: stock unit contains this many of this unit. multiply: this unit contains this many stock units. */
  factorDirection?: "multiply" | "divide";
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
  categoryId?: string;
  baseUnitId?: string;
  name: string;
  urduName?: string;
  /** Shop search ID (1, 2, 3…). Prefer this over SKU when looking up products. */
  productNo?: number;
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
  totalStock?: number;
  branchStock?: ProductBranchStock[];
  components: BomLine[];
  sellUnits?: ProductSellUnit[];
  /** Set by product search when a sell-unit barcode matched exactly. */
  matchedUnitId?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  urduName?: string;
  qty: number;
  unit: string;
  price: number;
  minFloor: number;
  lotsNote: string;
  discount?: number;
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
