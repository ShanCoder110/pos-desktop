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
  "branches",
  "units",
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
  { id: "profit", label: "Profit" },
  { id: "stock", label: "Qty" },
  { id: "status", label: "Status" },
];

export const DEFAULT_PRODUCT_COLUMNS = [
  "name",
  "category",
  "retail",
  "margin",
  "sales",
  "profit",
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
  added: "Product added",
  saved: "Product saved",
  deleted: "Product deleted",
  saveFailed: "Could not save product",
  deleteFailed: "Could not delete product",
  loadFailed: "Could not load products",
  categoryRequired: "Choose a category",
  unitRequired: "Choose a unit",
  sessionRequired: "Sign in again to save products",
  branchesTitle: "Branch stock",
  branchesHint: "Split opening quantity across branches. FIFO lots are created per branch.",
  branchesTotal: "Total quantity",
  branchesEmpty: "Leave zero if stock will be received later through lots.",
};

export const REORDER_PRODUCT_COLUMNS = [
  { id: "name", label: "Name", locked: true },
  { id: "supplier", label: "Last supplier" },
  { id: "stock", label: "Current qty" },
  { id: "minStock", label: "Minimum qty" },
  { id: "recommended", label: "Recommended order" },
  { id: "lastCost", label: "Last cost" },
];

export const DEFAULT_REORDER_COLUMNS = REORDER_PRODUCT_COLUMNS.map((column) => column.id);

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

export const TRANSFER_TABLE_COLUMNS = [
  { id: "from", label: "From", locked: true },
  { id: "to", label: "To" },
  { id: "status", label: "Status" },
  { id: "items", label: "Items" },
  { id: "created", label: "Created" },
  { id: "completed", label: "Completed" },
  { id: "by", label: "By" },
];
