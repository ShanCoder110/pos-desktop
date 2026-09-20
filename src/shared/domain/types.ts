export type UserRole = "OWNER" | "MANAGER" | "CASHIER" | "TECHNICIAN" | "PARTNER";

/** Software access role — what the person can do in the POS app. */
export type UserAccessRole = "OWNER" | "MANAGER" | "CASHIER";

/** Business role — what the person does day-to-day for the shop. */
export type EmployeeRole =
  "CASHIER" | "SALESMAN" | "TECHNICIAN" | "REPAIR_WORKER" | "ACCOUNTANT" | "HELPER" | "OTHER";

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: EmployeeRole;
  branchId: string;
  joiningDate: string;
  salaryWage: number | null;
  isActive: boolean;
  notes: string;
  totalPaid: number;
}

export interface PosUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  username: string;
  role: UserAccessRole;
  branchIds: string[];
  linkedEmployeeId: string | null;
  isActive: boolean;
  hasPassword: boolean;
  permissions: Record<string, boolean>;
}

export interface EmployeeLedgerEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  entryType: "SALARY" | "COMMISSION";
  debit: number;
  balanceAfter: number;
  occurredAt: string;
  notes: string;
}
export type BranchType = "STORE" | "WAREHOUSE" | "REPAIR" | "PRODUCTION";
export type PaymentStatus = "PAID" | "PARTIAL" | "CREDIT";
export type InvoiceState = "COMPLETED" | "CANCELLED";
export type ReturnType = "REFUND" | "REPLACEMENT";
export type ItemCondition = "GOOD" | "DAMAGED" | "WARRANTY";
export type TransferStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type ProductionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type CommissionStatus = "PENDING" | "PAID";
export type MoneyDirection = "IN" | "OUT";
export type PaymentMethod = "CASH" | "CARD" | "BANK" | "OTHER";
export type SyncStatus = "STARTED" | "SUCCESS" | "FAILED";

export type StockMoveType =
  | "PURCHASE"
  | "SALE"
  | "RETURN"
  | "REPLACEMENT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "PRODUCTION_USE"
  | "PRODUCTION_OUTPUT"
  | "DAMAGE"
  | "ADJUSTMENT";

export type LedgerType = "CREDIT_SALE" | "PAYMENT" | "REFUND" | "ADVANCE" | "ADJUSTMENT";

export type TxnType = "SALE_PAYMENT" | "CUSTOMER_PAYMENT" | "REFUND" | "EXPENSE" | "COMMISSION";

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  branchId: string;
  cityId?: string;
  cityName?: string;
  phone: string;
  totalPaid: number;
  isActive: boolean;
  permissions?: Record<string, boolean>;
}

export interface UserPermission {
  id: string;
  userId: string;
  permission: string;
  isAllowed: boolean;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  type: BranchType;
  phone: string;
  address: string;
  isActive: boolean;
}

export interface BranchSetting {
  id: string;
  branchId: string;
  branchLotEnabled: boolean;
  allowNegativeStock: boolean;
}

export interface UnitRow {
  id: string;
  name: string;
  symbol: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  baseUnit: string;
  minimumStock: number;
  isManufactured: boolean;
  onHand: number;
}

export interface ProductUnitRow {
  id: string;
  productId: string;
  name: string;
  conversionQuantity: number;
  sellingPrice: number;
  barcode: string;
  isDefault: boolean;
}

export interface LotBranchAllocation {
  branchId: string;
  quantity: number;
}

export interface ProductLotRow {
  id: string;
  productId: string;
  supplierId: string;
  lotNumber: string;
  branchId?: string;
  branchAllocations?: LotBranchAllocation[];
  purchasePrice: number;
  minimumPrice: number;
  wholesalePrice: number;
  retailPrice: number;
  originalQuantity: number;
  remainingQuantity: number;
  damagedQuantity: number;
  receivedAt: string;
  expiryDate: string | null;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  purchaseOrderId?: string | null;
  purchaseOrderNumber?: string | null;
  purchaseOrderStatus?: string | null;
  paidNow?: number;
}

export interface BranchLotRow {
  id: string;
  branchId: string;
  productLotId: string;
  allocatedQuantity: number;
  remainingQuantity: number;
}

export interface StockMovementRow {
  id: string;
  productId: string;
  productLotId: string;
  branchId: string;
  type: StockMoveType;
  quantity: number;
  referenceType: string;
  referenceId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface StockTransferItemRow {
  productId: string;
  productLotId: string;
  quantity: number;
  sentQuantity: number;
  receivedQuantity: number;
}

export interface StockTransferRow {
  id: string;
  transferNumber: string;
  fromBranchId: string;
  toBranchId: string;
  status: TransferStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  completedAt: string | null;
  items: StockTransferItemRow[];
}

export interface ProductComponentRow {
  id: string;
  productId: string;
  componentProductId: string;
  quantity: number;
  unit: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  cityId?: string;
  cityName?: string;
  address: string;
  notes: string;
  currentBalance: number;
  previousBalance?: string;
  openingSide?: "we-owe" | "they-owe";
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  branchId: string;
  customerId: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  creditAmount: number;
  paymentStatus: PaymentStatus;
  status: InvoiceState;
  notes: string;
  createdBy: string;
  createdAt: string;
  items: InvoiceItemRow[];
}

export interface InvoiceItemRow {
  id: string;
  productId: string;
  unitName: string;
  quantity: number;
  baseQuantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface ReturnRow {
  id: string;
  invoiceId: string;
  branchId: string;
  customerId: string | null;
  type: ReturnType;
  refundAmount: number;
  reason: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  returnItems: {
    productId: string;
    lotId: string;
    quantity: number;
    baseQuantity: number;
    condition: ItemCondition;
    refundAmount: number;
  }[];
  replacementItems: {
    productId: string;
    unitName: string;
    quantity: number;
    baseQuantity: number;
  }[];
}

export interface DomainCustomer {
  id: string;
  name: string;
  phone: string;
  cityId?: string;
  cityName?: string;
  address: string;
  currentBalance: number;
  notes: string;
  isActive: boolean;
  isWalkIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerRow {
  id: string;
  customerId: string;
  branchId: string;
  invoiceId: string | null;
  type: LedgerType;
  debit: number;
  credit: number;
  balanceAfter: number;
  notes: string;
  createdAt: string;
}

export interface MoneyTxnRow {
  id: string;
  branchId: string;
  type: TxnType;
  direction: MoneyDirection;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceType: string;
  referenceId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ExpenseRow {
  id: string;
  branchId: string;
  categoryId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
  expenseDate: string;
  createdBy: string;
}

export interface ProductionRow {
  id: string;
  productionNumber: string;
  branchId: string;
  productId: string;
  outputQuantity: number;
  employeeId: string;
  status: ProductionStatus;
  materialCost: number;
  damageCost: number;
  commissionAmount: number;
  totalCost: number;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string;
  items: {
    productId: string;
    lotId: string;
    quantityUsed: number;
    quantityDamaged: number;
    unitCost: number;
  }[];
}

export interface DeviceRow {
  id: string;
  name: string;
  branchId: string;
  isActive: boolean;
  lastSeenAt: string;
  lastSyncedAt: string;
}

export interface SyncLogRow {
  id: string;
  deviceId: string;
  status: SyncStatus;
  recordsPushed: number;
  recordsPulled: number;
  errorMessage: string;
  startedAt: string;
  completedAt: string | null;
}
