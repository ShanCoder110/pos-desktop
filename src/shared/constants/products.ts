import { QUERY_TAB } from "@/shared/constants/query";
import { routes } from "@/shared/constants/routes";

export const PRODUCT_TAB_ALL = "all";

export const PRODUCT_SECTION_TABS = [
  { id: PRODUCT_TAB_ALL, label: "All products" },
  { id: "lots", label: "Lots" },
  { id: "units", label: "Units" },
  { id: "categories", label: "Categories" },
  { id: "transfers", label: "Transfers" },
  { id: "low", label: "Reorder" },
] as const;

export type ProductSectionTab = (typeof PRODUCT_SECTION_TABS)[number]["id"];

export function productsHref(tab: ProductSectionTab = PRODUCT_TAB_ALL) {
  return `${routes.products}?${QUERY_TAB}=${tab}`;
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
  { id: "name", label: "Name", locked: true },
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
    "The biggest unit is the stock unit by default. Assign another unit as stock when adding or editing. Qty converts through that unit. Each unit has its own prices and profit.",
  stockUnit: "Stock unit",
  makeStockUnit: "Use as stock",
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
  openingQtyRequired: "Enter opening quantity",
  lowStockAlert: "Low stock alert",
  lowStockHint:
    "Alerts when overall stock — total remaining qty from all open lots (all branches) — reaches this or below.",
  lowStockRequired: "Enter a low stock quantity",
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
  detailVsCost: "vs cost",
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
} as const;

export const LOT_TABLE_COLUMNS = [
  { id: "lot", label: "Lot", locked: true },
  { id: "product", label: "Product" },
  { id: "supplier", label: "Supplier" },
  { id: "cost", label: "Cost" },
  { id: "original", label: "Original" },
  { id: "left", label: "Left" },
  { id: "damaged", label: "Damaged" },
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
  "fromStock",
  "toStock",
  "status",
  "created",
  "completed",
];
