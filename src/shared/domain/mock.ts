import type {
  Branch,
  BranchLotRow,
  BranchSetting,
  CatalogProduct,
  DeviceRow,
  DomainCustomer,
  ExpenseCategory,
  ExpenseRow,
  InvoiceRow,
  LedgerRow,
  MoneyTxnRow,
  ProductComponentRow,
  ProductLotRow,
  ProductUnitRow,
  ProductionRow,
  ReturnRow,
  StaffUser,
  StockMovementRow,
  StockTransferRow,
  SupplierRow,
  SyncLogRow,
  UnitRow,
  UserPermission,
} from "@/shared/domain/types";

export const branches: Branch[] = [
  { id: "b1", name: "Main Store", code: "MAIN", type: "STORE", phone: "042 1110001", address: "Hall Road, Lahore", isActive: true },
  { id: "b2", name: "City Warehouse", code: "WH1", type: "WAREHOUSE", phone: "042 1110002", address: "Ravi Road, Lahore", isActive: true },
  { id: "b3", name: "Repair Bench", code: "REP", type: "REPAIR", phone: "042 1110003", address: "Main Store, back", isActive: true },
  { id: "b4", name: "Fan Assembly", code: "PRD", type: "PRODUCTION", phone: "042 1110004", address: "Workshop, Lahore", isActive: true },
];

export const branchSettings: BranchSetting[] = [
  { id: "bs1", branchId: "b1", branchLotEnabled: false, allowNegativeStock: false },
  { id: "bs2", branchId: "b2", branchLotEnabled: true, allowNegativeStock: false },
  { id: "bs3", branchId: "b3", branchLotEnabled: false, allowNegativeStock: true },
  { id: "bs4", branchId: "b4", branchLotEnabled: true, allowNegativeStock: false },
];

export const staffUsers: StaffUser[] = [
  { id: "u1", name: "Shan Abbas", username: "shan", role: "OWNER", branchId: "b1", phone: "0300 0000001", isActive: true },
  { id: "u2", name: "Usman Ali", username: "usman", role: "CASHIER", branchId: "b1", phone: "0300 0000002", isActive: true },
  { id: "u3", name: "Sana Malik", username: "sana", role: "MANAGER", branchId: "b2", phone: "0300 0000003", isActive: true },
  { id: "u4", name: "Imran Sheikh", username: "imran", role: "TECHNICIAN", branchId: "b4", phone: "0300 0000004", isActive: true },
  { id: "u5", name: "Old till", username: "till2", role: "CASHIER", branchId: "b1", phone: "", isActive: false },
];

export const userPermissions: UserPermission[] = [
  { id: "up1", userId: "u2", permission: "invoice.create", isAllowed: true },
  { id: "up2", userId: "u2", permission: "product.edit", isAllowed: false },
  { id: "up3", userId: "u2", permission: "return.create", isAllowed: true },
  { id: "up4", userId: "u2", permission: "expense.view", isAllowed: false },
  { id: "up5", userId: "u2", permission: "report.view", isAllowed: false },
  { id: "up6", userId: "u3", permission: "invoice.create", isAllowed: true },
  { id: "up7", userId: "u3", permission: "product.edit", isAllowed: true },
  { id: "up8", userId: "u3", permission: "return.create", isAllowed: true },
  { id: "up9", userId: "u3", permission: "expense.view", isAllowed: true },
  { id: "up10", userId: "u3", permission: "report.view", isAllowed: true },
];

export const units: UnitRow[] = [
  { id: "un1", name: "Meter", symbol: "m" },
  { id: "un2", name: "Piece", symbol: "pc" },
  { id: "un3", name: "Kilogram", symbol: "kg" },
  { id: "un4", name: "Pack", symbol: "pk" },
  { id: "un5", name: "Box", symbol: "box" },
  { id: "un6", name: "Gaz", symbol: "gaz" },
];

export const catalog: CatalogProduct[] = [
  { id: "p1", name: "1.5mm copper wire", sku: "W001", barcode: "89010001", category: "Wire", baseUnit: "m", minimumStock: 70, isManufactured: false, onHand: 42 },
  { id: "p2", name: "2.5mm copper wire", sku: "W002", barcode: "89010002", category: "Wire", baseUnit: "m", minimumStock: 40, isManufactured: false, onHand: 18 },
  { id: "p3", name: 'Ceiling fan 56"', sku: "F001", barcode: "89010003", category: "Fans", baseUnit: "pc", minimumStock: 8, isManufactured: true, onHand: 7 },
  { id: "p4", name: "LED bulb 12W", sku: "L001", barcode: "89010004", category: "Lights", baseUnit: "pc", minimumStock: 30, isManufactured: false, onHand: 64 },
  { id: "p5", name: "Switch 10A", sku: "C001", barcode: "89010005", category: "Switches", baseUnit: "pc", minimumStock: 50, isManufactured: false, onHand: 120 },
  { id: "p6", name: "3-pin socket", sku: "C004", barcode: "89010006", category: "Switches", baseUnit: "pc", minimumStock: 40, isManufactured: false, onHand: 86 },
  { id: "p7", name: "Breaker 32A", sku: "B001", barcode: "89010007", category: "Breakers", baseUnit: "pc", minimumStock: 15, isManufactured: false, onHand: 11 },
  { id: "p8", name: "Insulation tape", sku: "T001", barcode: "89010008", category: "Tools", baseUnit: "pc", minimumStock: 20, isManufactured: false, onHand: 0 },
];

export const productUnits: ProductUnitRow[] = [
  { id: "pu1", productId: "p1", name: "Meter", conversionQuantity: 1, sellingPrice: 85, barcode: "89010001", isDefault: true },
  { id: "pu2", productId: "p1", name: "90m Roll", conversionQuantity: 90, sellingPrice: 7200, barcode: "89019001", isDefault: false },
  { id: "pu3", productId: "p5", name: "Piece", conversionQuantity: 1, sellingPrice: 80, barcode: "89010005", isDefault: true },
  { id: "pu4", productId: "p5", name: "Pack of 12", conversionQuantity: 12, sellingPrice: 900, barcode: "89011205", isDefault: false },
  { id: "pu5", productId: "p4", name: "Piece", conversionQuantity: 1, sellingPrice: 280, barcode: "89010004", isDefault: true },
  { id: "pu6", productId: "p4", name: "Box of 100", conversionQuantity: 100, sellingPrice: 25000, barcode: "89010400", isDefault: false },
];

export const suppliers: SupplierRow[] = [
  { id: "s1", name: "Ali Traders", phone: "042 1112223", email: "ali@traders.pk", address: "Shah Alam, Lahore", notes: "Wire and switches", isActive: true },
  { id: "s2", name: "Bilal Cables", phone: "042 3344556", email: "sales@bilalcables.pk", address: "Hall Road", notes: "", isActive: true },
  { id: "s3", name: "Noor Lights", phone: "0301 5566778", email: "noor@lights.pk", address: "Township", notes: "Fans and bulbs", isActive: true },
  { id: "s4", name: "Closed vendor", phone: "", email: "", address: "", notes: "Do not order", isActive: false },
];

export const productLots: ProductLotRow[] = [
  { id: "lot1", productId: "p1", supplierId: "s1", lotNumber: "L-2401", purchasePrice: 62, originalQuantity: 90, remainingQuantity: 2, damagedQuantity: 0, receivedAt: "2026-06-02", expiryDate: null, createdBy: "u1" },
  { id: "lot2", productId: "p1", supplierId: "s2", lotNumber: "L-2408", purchasePrice: 58, originalQuantity: 90, remainingQuantity: 40, damagedQuantity: 0, receivedAt: "2026-08-01", expiryDate: null, createdBy: "u3" },
  { id: "lot3", productId: "p3", supplierId: "s3", lotNumber: "L-2410", purchasePrice: 4200, originalQuantity: 12, remainingQuantity: 7, damagedQuantity: 0, receivedAt: "2026-08-04", expiryDate: null, createdBy: "u1" },
  { id: "lot4", productId: "p4", supplierId: "s3", lotNumber: "L-2411", purchasePrice: 180, originalQuantity: 100, remainingQuantity: 64, damagedQuantity: 0, receivedAt: "2026-08-06", expiryDate: "2028-08-06", createdBy: "u3" },
  { id: "lot5", productId: "p5", supplierId: "s1", lotNumber: "L-2412", purchasePrice: 45, originalQuantity: 200, remainingQuantity: 120, damagedQuantity: 0, receivedAt: "2026-08-08", expiryDate: null, createdBy: "u2" },
  { id: "lot6", productId: "p8", supplierId: "s1", lotNumber: "L-2390", purchasePrice: 40, originalQuantity: 48, remainingQuantity: 0, damagedQuantity: 4, receivedAt: "2026-05-12", expiryDate: null, createdBy: "u1" },
];

export const branchLots: BranchLotRow[] = [
  { id: "bl1", branchId: "b2", productLotId: "lot2", allocatedQuantity: 40, remainingQuantity: 40 },
  { id: "bl2", branchId: "b4", productLotId: "lot3", allocatedQuantity: 4, remainingQuantity: 2 },
];

export const stockMovements: StockMovementRow[] = [
  { id: "m1", productId: "p1", productLotId: "lot2", branchId: "b1", type: "PURCHASE", quantity: 90, referenceType: "ProductLot", referenceId: "lot2", notes: "New roll stock", createdBy: "u3", createdAt: "2026-08-01 11:20" },
  { id: "m2", productId: "p1", productLotId: "lot2", branchId: "b1", type: "SALE", quantity: -50, referenceType: "Invoice", referenceId: "inv4", notes: "1 × 90m not used — 50m cut", createdBy: "u2", createdAt: "2026-08-13 10:40" },
  { id: "m3", productId: "p5", productLotId: "lot5", branchId: "b1", type: "SALE", quantity: -6, referenceType: "Invoice", referenceId: "inv2", notes: "Walk-in", createdBy: "u2", createdAt: "2026-08-13 09:40" },
  { id: "m4", productId: "p3", productLotId: "lot3", branchId: "b1", type: "SALE", quantity: -1, referenceType: "Invoice", referenceId: "inv1", notes: "FIFO lot L-2410", createdBy: "u2", createdAt: "2026-08-13 10:14" },
  { id: "m5", productId: "p4", productLotId: "lot4", branchId: "b1", type: "RETURN", quantity: 2, referenceType: "ReturnReplacement", referenceId: "rr1", notes: "Good condition back to lot", createdBy: "u2", createdAt: "2026-08-13 16:10" },
  { id: "m6", productId: "p1", productLotId: "lot2", branchId: "b2", type: "TRANSFER_IN", quantity: 40, referenceType: "BranchStockTransfer", referenceId: "tr1", notes: "To warehouse", createdBy: "u3", createdAt: "2026-08-12 14:00" },
  { id: "m7", productId: "p1", productLotId: "lot2", branchId: "b1", type: "TRANSFER_OUT", quantity: -40, referenceType: "BranchStockTransfer", referenceId: "tr1", notes: "From main", createdBy: "u3", createdAt: "2026-08-12 14:00" },
  { id: "m8", productId: "p3", productLotId: "lot3", branchId: "b4", type: "PRODUCTION_USE", quantity: -2, referenceType: "Production", referenceId: "pr1", notes: "Motor housings", createdBy: "u4", createdAt: "2026-08-11 09:00" },
  { id: "m9", productId: "p3", productLotId: "lot3", branchId: "b4", type: "PRODUCTION_OUTPUT", quantity: 2, referenceType: "Production", referenceId: "pr1", notes: "Assembled fans", createdBy: "u4", createdAt: "2026-08-11 17:40" },
  { id: "m10", productId: "p8", productLotId: "lot6", branchId: "b1", type: "DAMAGE", quantity: -4, referenceType: "Adjustment", referenceId: "adj1", notes: "Water damage", createdBy: "u1", createdAt: "2026-07-02 12:00" },
];

export const transfers: StockTransferRow[] = [
  {
    id: "tr1",
    fromBranchId: "b1",
    toBranchId: "b2",
    status: "COMPLETED",
    notes: "Keep extra wire at warehouse",
    createdBy: "u3",
    createdAt: "2026-08-12 13:50",
    completedAt: "2026-08-12 14:00",
    items: [{ productId: "p1", productLotId: "lot2", quantity: 40 }],
  },
  {
    id: "tr2",
    fromBranchId: "b2",
    toBranchId: "b1",
    status: "PENDING",
    notes: "Restock main for weekend",
    createdBy: "u3",
    createdAt: "2026-08-24 18:00",
    completedAt: null,
    items: [
      { productId: "p1", productLotId: "lot2", quantity: 20 },
      { productId: "p5", productLotId: "lot5", quantity: 24 },
    ],
  },
  {
    id: "tr3",
    fromBranchId: "b1",
    toBranchId: "b3",
    status: "CANCELLED",
    notes: "Repair bench does not need this",
    createdBy: "u1",
    createdAt: "2026-08-10 09:00",
    completedAt: null,
    items: [{ productId: "p7", productLotId: "lot5", quantity: 2 }],
  },
];

export const bom: ProductComponentRow[] = [
  { id: "bom1", productId: "p3", componentProductId: "p5", quantity: 1, unit: "pc" },
  { id: "bom2", productId: "p3", componentProductId: "p1", quantity: 2, unit: "m" },
];

export const domainCustomers: DomainCustomer[] = [
  { id: "c1", name: "Ahmed Khan", phone: "0300 1112233", address: "Garden Town", currentBalance: 6000, creditLimit: 20000, notes: "Weekly payment", isActive: true },
  { id: "c2", name: "Fatima Bibi", phone: "0321 4455667", address: "Model Town", currentBalance: -5000, creditLimit: 10000, notes: "Advance from last bill", isActive: true },
  { id: "c3", name: "Bilal Hardware", phone: "042 5566778", address: "Hall Road", currentBalance: 500, creditLimit: 50000, notes: "", isActive: true },
  { id: "c4", name: "Rashid Traders", phone: "0333 7788990", address: "Shahdara", currentBalance: 0, creditLimit: null, notes: "", isActive: true },
  { id: "c5", name: "Old account", phone: "", address: "", currentBalance: 0, creditLimit: null, notes: "Closed", isActive: false },
];

export const invoices: InvoiceRow[] = [
  {
    id: "inv1",
    invoiceNumber: "INV-1042",
    branchId: "b1",
    customerId: "c1",
    subtotal: 5400,
    discount: 0,
    total: 5400,
    paidAmount: 4000,
    creditAmount: 1400,
    paymentStatus: "PARTIAL",
    status: "COMPLETED",
    notes: "",
    createdBy: "u2",
    createdAt: "2026-08-13 10:14",
    items: [{ id: "ii1", productId: "p3", unitName: "Piece", quantity: 1, baseQuantity: 1, unitPrice: 5400, discount: 0, total: 5400 }],
  },
  {
    id: "inv2",
    invoiceNumber: "INV-1041",
    branchId: "b1",
    customerId: null,
    subtotal: 480,
    discount: 0,
    total: 480,
    paidAmount: 480,
    creditAmount: 0,
    paymentStatus: "PAID",
    status: "COMPLETED",
    notes: "Walk-in cash",
    createdBy: "u2",
    createdAt: "2026-08-13 09:40",
    items: [{ id: "ii2", productId: "p5", unitName: "Piece", quantity: 6, baseQuantity: 6, unitPrice: 80, discount: 0, total: 480 }],
  },
  {
    id: "inv3",
    invoiceNumber: "INV-1038",
    branchId: "b1",
    customerId: "c2",
    subtotal: 2800,
    discount: 0,
    total: 2800,
    paidAmount: 0,
    creditAmount: 2800,
    paymentStatus: "CREDIT",
    status: "COMPLETED",
    notes: "Udhaar — deducted from advance later",
    createdBy: "u2",
    createdAt: "2026-08-12 18:22",
    items: [{ id: "ii3", productId: "p4", unitName: "Piece", quantity: 10, baseQuantity: 10, unitPrice: 280, discount: 0, total: 2800 }],
  },
  {
    id: "inv4",
    invoiceNumber: "INV-1043",
    branchId: "b1",
    customerId: "c3",
    subtotal: 7200,
    discount: 0,
    total: 7200,
    paidAmount: 7200,
    creditAmount: 0,
    paymentStatus: "PAID",
    status: "COMPLETED",
    notes: "1 × 90m roll",
    createdBy: "u2",
    createdAt: "2026-08-13 10:40",
    items: [{ id: "ii4", productId: "p1", unitName: "90m Roll", quantity: 1, baseQuantity: 90, unitPrice: 7200, discount: 0, total: 7200 }],
  },
  {
    id: "inv5",
    invoiceNumber: "INV-1020",
    branchId: "b1",
    customerId: "c1",
    subtotal: 800,
    discount: 0,
    total: 800,
    paidAmount: 0,
    creditAmount: 0,
    paymentStatus: "PAID",
    status: "CANCELLED",
    notes: "Wrong bill — cancelled",
    createdBy: "u2",
    createdAt: "2026-08-10 11:00",
    items: [{ id: "ii5", productId: "p6", unitName: "Piece", quantity: 4, baseQuantity: 4, unitPrice: 200, discount: 0, total: 800 }],
  },
];

export const returns: ReturnRow[] = [
  {
    id: "rr1",
    invoiceId: "inv3",
    branchId: "b1",
    customerId: "c2",
    type: "REFUND",
    refundAmount: 560,
    reason: "Two bulbs unused",
    notes: "Cash refund",
    createdBy: "u2",
    createdAt: "2026-08-13 16:10",
    returnItems: [{ productId: "p4", lotId: "lot4", quantity: 2, baseQuantity: 2, condition: "GOOD", refundAmount: 560 }],
    replacementItems: [],
  },
  {
    id: "rr2",
    invoiceId: "inv1",
    branchId: "b1",
    customerId: "c1",
    type: "REPLACEMENT",
    refundAmount: 0,
    reason: "Fan noise under warranty",
    notes: "Swap from lot L-2410",
    createdBy: "u2",
    createdAt: "2026-08-14 12:00",
    returnItems: [{ productId: "p3", lotId: "lot3", quantity: 1, baseQuantity: 1, condition: "WARRANTY", refundAmount: 0 }],
    replacementItems: [{ productId: "p3", unitName: "Piece", quantity: 1, baseQuantity: 1 }],
  },
  {
    id: "rr3",
    invoiceId: "inv4",
    branchId: "b1",
    customerId: "c3",
    type: "REFUND",
    refundAmount: 0,
    reason: "Damaged on open",
    notes: "No cash — claim to supplier later",
    createdBy: "u1",
    createdAt: "2026-08-15 09:20",
    returnItems: [{ productId: "p1", lotId: "lot2", quantity: 5, baseQuantity: 5, condition: "DAMAGED", refundAmount: 0 }],
    replacementItems: [],
  },
];

export const ledger: LedgerRow[] = [
  { id: "ld1", customerId: "c1", branchId: "b1", invoiceId: "inv1", type: "CREDIT_SALE", debit: 1400, credit: 0, balanceAfter: 7400, notes: "Unpaid part of INV-1042", createdAt: "2026-08-13 10:14" },
  { id: "ld2", customerId: "c1", branchId: "b1", invoiceId: null, type: "PAYMENT", debit: 0, credit: 1400, balanceAfter: 6000, notes: "Cash at counter", createdAt: "2026-08-13 19:00" },
  { id: "ld3", customerId: "c2", branchId: "b1", invoiceId: "inv3", type: "CREDIT_SALE", debit: 2800, credit: 0, balanceAfter: -2200, notes: "Used advance", createdAt: "2026-08-12 18:22" },
  { id: "ld4", customerId: "c2", branchId: "b1", invoiceId: "rr1", type: "REFUND", debit: 0, credit: 560, balanceAfter: -2760, notes: "Bulb return", createdAt: "2026-08-13 16:10" },
  { id: "ld5", customerId: "c2", branchId: "b1", invoiceId: null, type: "ADVANCE", debit: 0, credit: 2240, balanceAfter: -5000, notes: "Extra cash kept", createdAt: "2026-08-14 11:00" },
  { id: "ld6", customerId: "c3", branchId: "b1", invoiceId: null, type: "ADJUSTMENT", debit: 500, credit: 0, balanceAfter: 500, notes: "Old khata brought forward", createdAt: "2026-08-01 10:00" },
];

export const moneyTxns: MoneyTxnRow[] = [
  { id: "tx1", branchId: "b1", type: "SALE_PAYMENT", direction: "IN", amount: 4000, paymentMethod: "CASH", referenceType: "Invoice", referenceId: "inv1", notes: "Partial on INV-1042", createdBy: "u2", createdAt: "2026-08-13 10:14" },
  { id: "tx2", branchId: "b1", type: "SALE_PAYMENT", direction: "IN", amount: 480, paymentMethod: "CASH", referenceType: "Invoice", referenceId: "inv2", notes: "Walk-in", createdBy: "u2", createdAt: "2026-08-13 09:40" },
  { id: "tx3", branchId: "b1", type: "SALE_PAYMENT", direction: "IN", amount: 7200, paymentMethod: "BANK", referenceType: "Invoice", referenceId: "inv4", notes: "JazzCash", createdBy: "u2", createdAt: "2026-08-13 10:40" },
  { id: "tx4", branchId: "b1", type: "CUSTOMER_PAYMENT", direction: "IN", amount: 1400, paymentMethod: "CASH", referenceType: "CustomerLedger", referenceId: "ld2", notes: "Ahmed khata", createdBy: "u2", createdAt: "2026-08-13 19:00" },
  { id: "tx5", branchId: "b1", type: "REFUND", direction: "OUT", amount: 560, paymentMethod: "CASH", referenceType: "ReturnReplacement", referenceId: "rr1", notes: "Bulb refund", createdBy: "u2", createdAt: "2026-08-13 16:10" },
  { id: "tx6", branchId: "b1", type: "EXPENSE", direction: "OUT", amount: 2500, paymentMethod: "CASH", referenceType: "Expense", referenceId: "ex1", notes: "Shop rent share", createdBy: "u1", createdAt: "2026-08-01 09:00" },
  { id: "tx7", branchId: "b4", type: "COMMISSION", direction: "OUT", amount: 400, paymentMethod: "CASH", referenceType: "EmployeeCommission", referenceId: "ec1", notes: "Imran fan job", createdBy: "u1", createdAt: "2026-08-11 18:00" },
];

export const expenseCategories: ExpenseCategory[] = [
  { id: "ec1", name: "Rent", isActive: true },
  { id: "ec2", name: "Bills", isActive: true },
  { id: "ec3", name: "Tea / staff", isActive: true },
  { id: "ec4", name: "Transport", isActive: true },
];

export const expenses: ExpenseRow[] = [
  { id: "ex1", branchId: "b1", categoryId: "ec1", amount: 2500, paymentMethod: "CASH", description: "August rent share", expenseDate: "2026-08-01", createdBy: "u1" },
  { id: "ex2", branchId: "b1", categoryId: "ec2", amount: 1800, paymentMethod: "BANK", description: "Electricity", expenseDate: "2026-08-08", createdBy: "u1" },
  { id: "ex3", branchId: "b4", categoryId: "ec4", amount: 600, paymentMethod: "CASH", description: "Parts pickup", expenseDate: "2026-08-11", createdBy: "u4" },
];

export const productions: ProductionRow[] = [
  {
    id: "pr1",
    productionNumber: "PR-014",
    branchId: "b4",
    productId: "p3",
    outputQuantity: 2,
    employeeId: "u4",
    status: "COMPLETED",
    materialCost: 8480,
    damageCost: 85,
    commissionAmount: 400,
    totalCost: 8965,
    startedAt: "2026-08-11 09:00",
    completedAt: "2026-08-11 17:40",
    createdBy: "u1",
    items: [
      { productId: "p5", lotId: "lot5", quantityUsed: 2, quantityDamaged: 0, unitCost: 45 },
      { productId: "p1", lotId: "lot2", quantityUsed: 4, quantityDamaged: 1, unitCost: 58 },
    ],
  },
  {
    id: "pr2",
    productionNumber: "PR-015",
    branchId: "b4",
    productId: "p3",
    outputQuantity: 4,
    employeeId: "u4",
    status: "IN_PROGRESS",
    materialCost: 0,
    damageCost: 0,
    commissionAmount: 0,
    totalCost: 0,
    startedAt: "2026-08-24 10:00",
    completedAt: null,
    createdBy: "u1",
    items: [{ productId: "p5", lotId: "lot5", quantityUsed: 1, quantityDamaged: 0, unitCost: 45 }],
  },
  {
    id: "pr3",
    productionNumber: "PR-016",
    branchId: "b4",
    productId: "p3",
    outputQuantity: 6,
    employeeId: "u4",
    status: "PENDING",
    materialCost: 0,
    damageCost: 0,
    commissionAmount: 0,
    totalCost: 0,
    startedAt: null,
    completedAt: null,
    createdBy: "u1",
    items: [],
  },
];

export const devices: DeviceRow[] = [
  { id: "d1", name: "Main counter PC", branchId: "b1", isActive: true, lastSeenAt: "2026-08-25 00:40", lastSyncedAt: "2026-08-25 00:38" },
  { id: "d2", name: "Warehouse till", branchId: "b2", isActive: true, lastSeenAt: "2026-08-24 19:12", lastSyncedAt: "2026-08-24 19:10" },
  { id: "d3", name: "Old laptop", branchId: "b1", isActive: false, lastSeenAt: "2026-07-02 08:00", lastSyncedAt: "2026-07-02 08:00" },
];

export const syncLogs: SyncLogRow[] = [
  { id: "sy1", deviceId: "d1", status: "SUCCESS", recordsPushed: 18, recordsPulled: 4, errorMessage: "", startedAt: "2026-08-25 00:38", completedAt: "2026-08-25 00:38" },
  { id: "sy2", deviceId: "d2", status: "FAILED", recordsPushed: 0, recordsPulled: 0, errorMessage: "Wi-Fi dropped", startedAt: "2026-08-24 19:10", completedAt: "2026-08-24 19:11" },
];

export function findName<T extends { id: string; name: string }>(rows: T[], id: string | null | undefined, fallback = "—") {
  if (!id) return fallback;
  return rows.find((r) => r.id === id)?.name ?? fallback;
}

export const productName = (id: string) => findName(catalog, id);
export const branchName = (id: string) => findName(branches, id);
export const userName = (id: string) => findName(staffUsers, id);
export const supplierName = (id: string) => findName(suppliers, id);
export const customerName = (id: string | null) => (id ? findName(domainCustomers, id) : "Walk-in");
export const unitName = (id: string) => findName(units, id);
export const lotNumber = (id: string) => productLots.find((l) => l.id === id)?.lotNumber ?? "—";
export const invoiceNumber = (id: string) => invoices.find((i) => i.id === id)?.invoiceNumber ?? "—";
export const categoryName = (id: string) => findName(expenseCategories, id);
