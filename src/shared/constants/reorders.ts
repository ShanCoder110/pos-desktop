export const REORDER_STATUSES = ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
export type ReorderStatus = (typeof REORDER_STATUSES)[number];

export const REORDER_COPY = {
  tab: "Reorders",
  lowStockTab: "Low stock",
  title: "Reorders",
  createAction: "Reorder",
  receiveAction: "Receive",
  cancelAction: "Cancel",
  unlinkAction: "Unlink from reorder",
  addAction: "Add",
  qtyLabel: "Quantity",
  supplierLabel: "Supplier",
  costLabel: "Cost",
  paidNowLabel: "Paid now",
  remainderLabel: "Remainder",
  warningTitle: "Low stock — reorder",
  shortcutHint: "↑↓ move · R reorder",
  reordersShortcutHint: "↑↓ move · Enter receive",
  created: "Reorder added",
  cancelled: "Reorder cancelled",
  unlinked: "Lot unlinked from reorder",
  createFailed: "Could not create reorder",
  cancelFailed: "Could not cancel reorder",
  unlinkFailed: "Could not unlink lot",
  supplierRequired: "Select a supplier",
  qtyRequired: "Enter a quantity",
  unitRequired: "This product needs a stock unit before it can be reordered",
  empty: "No reorders yet",
  detailTitle: "Reorder details",
  detailSubtitle: "Purchase order summary and line items",
  detailOrdered: "Qty ordered",
  detailReceived: "Qty received",
  detailCost: "Estimated cost",
  detailSupplier: "Supplier",
  detailOrderDate: "Order date",
  detailExpectedDate: "Expected",
  detailItems: "Line items",
  pending: "Pending",
  partiallyReceived: "Partially received",
  received: "Received",
  cancelledStatus: "Cancelled",
  filterStatus: "Status",
  filterSupplier: "Supplier",
  filterProduct: "Product",
  filterCity: "City",
  filterLineTotal: "Line total",
  unitCostColumn: "Unit cost",
  lineTotalColumn: "Line total",
  cityColumn: "City",
  filteredTotalCost: "Total line cost",
} as const;

export const REORDER_FILTER_FIELDS: {
  id: string;
  label: string;
  options?: string[];
  searchable?: boolean;
  placeholder?: string;
  numeric?: boolean;
}[] = [
  {
    id: "status",
    label: REORDER_COPY.filterStatus,
    options: [
      REORDER_COPY.pending,
      REORDER_COPY.partiallyReceived,
      REORDER_COPY.received,
      REORDER_COPY.cancelledStatus,
    ],
  },
  { id: "supplier", label: REORDER_COPY.filterSupplier, searchable: true },
  { id: "product", label: REORDER_COPY.filterProduct, searchable: true },
  { id: "city", label: REORDER_COPY.filterCity, searchable: true },
  {
    id: "lineTotal",
    label: REORDER_COPY.filterLineTotal,
    placeholder: "Minimum line total",
    numeric: true,
  },
];

export const REORDER_STATUS_LABEL: Record<ReorderStatus, string> = {
  PENDING: REORDER_COPY.pending,
  PARTIALLY_RECEIVED: REORDER_COPY.partiallyReceived,
  RECEIVED: REORDER_COPY.received,
  CANCELLED: REORDER_COPY.cancelledStatus,
};

export function linkedPoToast(orderNumber: string, status?: string | null) {
  const received = status === "RECEIVED" ? "fully received" : "partially received";
  return `Linked to PO ${orderNumber}, now ${received}.`;
}
