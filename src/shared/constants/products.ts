import { routes } from "@/shared/constants/routes";

export const PRODUCT_SECTION_TABS = [
  { id: "all", to: routes.products, label: "All products", end: true },
  { id: "lots", to: routes.lots, label: "Lots" },
  { id: "units", to: routes.units, label: "Units" },
  { id: "categories", to: routes.productsCategories, label: "Categories" },
  { id: "transfers", to: routes.transfers, label: "Transfers" },
  { id: "low", to: routes.productsLow, label: "Reorder" },
] as const;

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

export const PRODUCT_FORM_SECTIONS = ["details", "units", "lots", "recipe", "warranty"] as const;

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

export const DEFAULT_PRODUCT_COLUMNS = ["name", "category", "cost", "min", "wholesale", "retail", "margin", "sales", "profit", "stock", "status"];

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
  { id: "received", label: "Received" },
  { id: "cost", label: "Cost" },
  { id: "original", label: "Original" },
  { id: "left", label: "Left" },
  { id: "damaged", label: "Damaged" },
  { id: "by", label: "By" },
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
