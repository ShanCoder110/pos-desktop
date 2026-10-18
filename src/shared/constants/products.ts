import { QUERY_CATEGORY_ID, QUERY_TAB } from "@/shared/constants/query";
import { routes } from "@/shared/constants/routes";

export const PRODUCT_TAB_ALL = "all";

export const PRODUCT_SECTION_TABS = [
  { id: PRODUCT_TAB_ALL, label: "All products" },
  { id: "lots", label: "Lots" },
  { id: "units", label: "Units" },
  { id: "categories", label: "Categories" },
  { id: "transfers", label: "Transfers" },
  { id: "reorders", label: "Reorders" },
  { id: "low", label: "Low stock" },
] as const;

/** @deprecated Stock count tab removed — adjust Qty left on Edit product / Edit lot. */
export const STOCK_COUNT_ROLES = new Set(["OWNER", "MANAGER"]);

export const STOCK_COUNT_COPY = {
  title: "Stock count",
  subtitle: "Count on-hand stock and post an adjustment",
  product: "Product",
  branch: "Branch",
  unit: "Count unit",
  currentBase: "System qty (base)",
  currentInUnit: "System qty (unit)",
  counted: "Counted qty",
  difference: "Difference",
  reason: "Reason",
  reasonPlaceholder: "Why is the count different?",
  reasonRequired: "Enter a reason",
  reasonMax: "Reason must be 200 characters or less",
  countedRequired: "Enter a counted quantity",
  countedNegative: "Counted quantity cannot be negative",
  countedTooLarge: "Counted quantity cannot exceed 1,000,000 base units",
  save: "Save count",
  saved: "Stock adjusted",
  saveFailed: "Could not adjust stock",
  history: "Adjustment history",
  historyEmpty: "No stock adjustments yet",
  supplierAdjust: "Adjust supplier payable",
  supplierAdjustHint: "Optional — posts a supplier ledger adjustment",
  supplier: "Supplier",
  supplierAmount: "Amount",
  denied: "Only owners and managers can adjust stock",
  pickProduct: "Choose a product",
  pickBranch: "Choose a branch",
  pickUnit: "Choose a unit",
  leftLockedHint: "Received qty is fixed. Change Qty left on the product or lot to adjust stock.",
  loadFailed: "Could not load stock movements",
  retry: "Retry",
} as const;

export type ProductSectionTab = (typeof PRODUCT_SECTION_TABS)[number]["id"];

export function productsHref(tab: ProductSectionTab = PRODUCT_TAB_ALL) {
  return `${routes.products}?${QUERY_TAB}=${tab}`;
}

export function productsCategoryHref(categoryId: string) {
  return `${routes.products}?${QUERY_TAB}=${PRODUCT_TAB_ALL}&${QUERY_CATEGORY_ID}=${encodeURIComponent(categoryId)}`;
}

export const PRODUCT_INSIGHT_METRICS = [
  { id: "sales", label: "Sales revenue" },
  { id: "profit", label: "Profit" },
  { id: "quantity", label: "Quantity sold" },
  { id: "averagePrice", label: "Average selling price" },
  { id: "cost", label: "Cost of goods" },
  { id: "margin", label: "Profit margin" },
] as const;

export type ProductInsightMetric = (typeof PRODUCT_INSIGHT_METRICS)[number]["id"];

export type ProductHealth = "healthy" | "risk" | "dead" | "phantom";

export const PRODUCT_HEALTH_LABEL: Record<ProductHealth, string> = {
  healthy: "Healthy",
  risk: "At risk",
  dead: "Dead",
  phantom: "Phantom",
};

export const PRODUCT_HEALTH_FROM_LABEL: Record<string, ProductHealth> = {
  Healthy: "healthy",
  "At risk": "risk",
  Dead: "dead",
  Phantom: "phantom",
};

export const PRODUCT_FORM_SECTIONS = [
  "details",
  "units",
  "branches",
  "lots",
  "recipe",
  "warranty",
] as const;

export type ProductFormSection = (typeof PRODUCT_FORM_SECTIONS)[number];

export const PRODUCT_TABLE_COLUMNS = [
  { id: "productNo", label: "ID" },
  { id: "name", label: "Name", locked: true },
  { id: "urduName", label: "Urdu name" },
  { id: "sku", label: "SKU" },
  { id: "category", label: "Category" },
  { id: "cost", label: "Cost" },
  { id: "min", label: "Minimum" },
  { id: "wholesale", label: "Wholesale" },
  { id: "retail", label: "Retail" },
  { id: "margin", label: "Margin" },
  { id: "sales", label: "Total sales" },
  { id: "stock", label: "Qty" },
  { id: "status", label: "Status" },
];

export const DEFAULT_PRODUCT_COLUMNS = [
  "productNo",
  "name",
  "category",
  "retail",
  "margin",
  "sales",
  "stock",
  "status",
];

export const CATEGORY_COPY = {
  added: "Category added",
  saved: "Category saved",
  deleted: "Category deleted",
  deletedMany: "Categories deleted",
  saveFailed: "Could not save category",
  deleteFailed: "Could not delete category",
  loadFailed: "Could not load categories",
} as const;

export const PRODUCT_COPY = {
  exportAction: "Export",
  pricingHint: "Hover for cost, minimum, and wholesale",
  unitProfit: "Unit profit",
  salesProfit: "Sales profit",
  added: "Product added",
  saved: "Product saved",
  deleted: "Product deleted",
  saveFailed: "Could not save product",
  deleteFailed: "Could not delete product",
  loadFailed: "Could not load products",
  categoryRequired: "Choose a category",
  unitRequired: "Choose a unit",
  unitsHint:
    "The opening-stock unit is the inventory unit. Add Gaz under Roll (1 Roll = 90 Gaz) or Pack over Piece (1 Pack = 12 Piece). Prices auto-fill from the conversion. The default sale unit only controls what POS selects first.",
  stockUnit: "Default sale",
  makeStockUnit: "Make default",
  inventoryUnit: "Inventory unit",
  inventoryUnitHint: "Stock quantity is on Lots",
  addUnitForConversion: "Add unit for Gaz / Pack",
  addUnitAction: "Add unit",
  unitNameRequired: "Choose a unit name",
  unitNameDuplicate: "Each unit name must be unique",
  unitFactorInvalid: "Enter a conversion greater than zero",
  unitBaseRequired: "Choose one base unit",
  sessionRequired: "Sign in again to save products",
  branchesTitle: "Branch stock",
  branchesHint: "Split opening quantity across branches. FIFO lots are created per branch.",
  branchesTotal: "Total quantity",
  branchesEmpty: "Leave zero if stock will be received later through lots.",
  unitPriceTierCost: "Cost",
  unitPriceTierMin: "Min",
  unitPriceTierWholesale: "Wholesale",
  unitPriceTierRetail: "Retail",
  unitPricesInvalid: "Fix unit prices before saving",
  unitPriceRequired: "Enter a price",
  openingQtyRequired: "Opening quantity cannot be negative",
  lowStockAlert: "Low stock alert (optional)",
  lowStockHint:
    "Alerts when overall stock — total remaining qty from all open lots (all branches) — reaches this or below.",
  unitPricesIncomplete: "Enter all prices on every unit",
  detailTitle: "Product details",
  detailSubtitle: "Stock, prices, lots, and branch quantity",
  detailUnitsTitle: "Units and pricing",
  detailInfoTitle: "Product info",
  detailCurrentStock: "In stock",
  detailBranchStock: "Stock by branch",
  detailThisBranch: "you are here",
  detailRetailPrice: "Retail price",
  detailCurrentLot: "Current lot",
  detailFifoNow: "FIFO now",
  detailSku: "SKU",
  detailType: "Type",
  detailLotProfit: "Realized profit from this lot",
  detailVsCost: "margin",
  detailWholesaleProfit: "Wholesale",
  detailRetailProfit: "Retail",
  detailBranches: (count: number) => `${count} branch${count === 1 ? "" : "es"}`,
  detailSingleBranch: "No branch split yet. All quantity is in the current shop.",
  detailMargin: "Margin",
  detailBaseUnit: "Base unit",
  detailNoSales: "No sales yet",
  detailQtySold: "Qty sold",
  detailOpenLots: "Open lots",
  detailNoOpenLots: "No open lots. Receive stock to create a FIFO lot.",
  detailFifoCost: "FIFO cost",
  detailLeftInLot: "Left",
  detailSoldFromLot: "Sold",
  detailStockValue: "Stock value",
  derivedPriceTooLow: (tier: string, minimum: string, parentName: string) =>
    `${tier} can't be less than ${minimum} (proportional to ${parentName})`,
};

export const PRODUCT_UNIT_PRICE_TIERS = {
  cost: PRODUCT_COPY.unitPriceTierCost,
  min: PRODUCT_COPY.unitPriceTierMin,
  wholesale: PRODUCT_COPY.unitPriceTierWholesale,
  price: PRODUCT_COPY.unitPriceTierRetail,
} as const;

export const REORDER_PRODUCT_COLUMNS = [
  { id: "name", label: "Name", locked: true },
  { id: "supplier", label: "Last supplier" },
  { id: "stock", label: "Current qty" },
  { id: "minStock", label: "Minimum qty" },
  { id: "recommended", label: "Recommended order" },
  { id: "lastCost", label: "Last cost" },
];

export const DEFAULT_REORDER_COLUMNS = REORDER_PRODUCT_COLUMNS.map((column) => column.id);

export const LOT_COPY = {
  detailTitle: "Lot details",
  detailSubtitle: "FIFO cost, quantities, and branch stock",
  reorderAction: "Reorder",
  reorderDescription: "Receive another lot for this product",
  transferAction: "Transfer",
  transferDescription: "Move stock between branches",
  editAction: "Edit",
  editDescription: "Adjust quantities, supplier, and prices",
  editDeniedCashier: "Only owners and managers can edit lots",
  branchStockTitle: "Branch stock",
  branchStockHint: "Quantity left in each branch for this lot",
  branchSplitTitle: "Split between branches",
  branchSplitHint: "Move stock between branches. Saving creates transfer records automatically.",
  branchSplitTotal: "Remaining in lot",
  branchSplitAutoPull: "Auto-balance from branch with most stock",
  branchSplitAutoPullHint:
    "Only when you go above the free pool — e.g. Main has 450 Gaz and Aleem 90, you can set Main up to 450 without touching Aleem; above that pulls from the branch with the most stock.",
  branchNeedQty: "Enter quantity for at least one branch",
  branchMustAllocate: "Allocate the remaining quantity before saving",
  branchOverAllocated: "Branch quantities cannot exceed lot quantity",
  filterProduct: "Product",
  filterStatus: "Status",
  filterSupplier: "Supplier",
  filterCity: "City",
  valueLeftColumn: "Value left",
  filteredValueTotal: "Total value left",
  loadFailed: "Could not load lots",
  retry: "Retry",
  expiryLabel: "Expiry",
  expiryHint: "Optional. Leave blank to clear.",
  expiryBeforeReceived: "Expiry cannot be before the received date",
  expiryPastWarning: "Expiry is in the past — saved anyway",
} as const;

export const LOT_FILTER_FIELDS: {
  id: string;
  label: string;
  options?: string[];
  searchable?: boolean;
  placeholder?: string;
  numeric?: boolean;
}[] = [
  {
    id: "product",
    label: LOT_COPY.filterProduct,
    searchable: true,
  },
  {
    id: "status",
    label: LOT_COPY.filterStatus,
    options: ["Remaining", "Empty"],
  },
  { id: "supplier", label: LOT_COPY.filterSupplier, searchable: true },
  { id: "city", label: LOT_COPY.filterCity, searchable: true },
  {
    id: "valueLeft",
    label: LOT_COPY.valueLeftColumn,
    placeholder: "Minimum value left",
    numeric: true,
  },
];

export const LOT_TABLE_COLUMNS = [
  { id: "lot", label: "Lot", locked: true },
  { id: "product", label: "Product" },
  { id: "supplier", label: "Supplier" },
  { id: "city", label: "City" },
  { id: "cost", label: "Cost" },
  { id: "value", label: "Value left" },
  { id: "original", label: "Original" },
  { id: "left", label: "Left" },
  { id: "damaged", label: "Damaged" },
  { id: "expiry", label: "Expiry" },
];

export const CATEGORY_TABLE_COLUMNS = [
  { id: "name", label: "Name", locked: true },
  { id: "products", label: "Products" },
];

export const UNIT_TABLE_COLUMNS = [
  { id: "name", label: "Name", locked: true },
  { id: "symbol", label: "Symbol" },
];

export const STOCK_TABLE_COLUMNS = [
  { id: "product", label: "Product", locked: true },
  { id: "sku", label: "SKU" },
  { id: "unit", label: "Base unit" },
  { id: "onHand", label: "On hand" },
  { id: "minimum", label: "Minimum" },
  { id: "status", label: "Status" },
];

export const TRANSFER_COPY = {
  addTitle: "Add transfer",
  addSubtitle: "Move lot stock between branches",
  viewTitle: "Transfer details",
  detailSubtitle: "Products moved and branch stock before and after",
  detailRoute: "Route",
  detailItems: "Items moved",
  detailTotalMoved: "Total moved",
  detailMovedQty: "Moved",
  detailBranchChange: "Branch stock for this lot",
  detailBefore: "Before",
  detailAfter: "After",
  detailNotesEmpty: "No notes",
  routeTitle: "Route",
  productSectionTitle: "Product",
  lotsTitle: "Lots to transfer",
  fromLabel: "From branch",
  toLabel: "To branch",
  notesLabel: "Notes",
  notesPlaceholder: "Optional note for this transfer",
  lotHint: "Select one or more lots and enter how much to move.",
  lotsHint: (branch: string) =>
    `Open lots with stock in ${branch}. You can transfer from more than one lot.`,
  pickFromBranch: "Select a source branch to see available lots.",
  pickProduct: "Select a product to see its open lots.",
  pickToBranch: "Select a destination branch before creating the transfer.",
  saveAction: "Create transfer",
  created: "Transfer completed",
  saveFailed: "Could not create transfer",
  fromRequired: "Select a source branch",
  toRequired: "Select a destination branch",
  sameBranch: "Source and destination must differ",
  productRequired: "Select a product",
  lotRequired: "Select at least one lot with quantity",
  noLots: "No open lots with stock in the source branch for this product.",
} as const;

export const TRANSFER_TABLE_COLUMNS = [
  { id: "from", label: "From", locked: true },
  { id: "to", label: "To" },
  { id: "product", label: "Product" },
  { id: "moved", label: "Moved" },
  { id: "fromStock", label: "From stock" },
  { id: "toStock", label: "To stock" },
  { id: "status", label: "Status" },
  { id: "created", label: "Created" },
  { id: "completed", label: "Completed" },
  { id: "items", label: "Lines" },
];

export const DEFAULT_TRANSFER_COLUMNS = [
  "from",
  "to",
  "product",
  "moved",
  "fromStock",
  "toStock",
  "status",
  "created",
  "completed",
];
