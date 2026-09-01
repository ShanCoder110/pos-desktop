export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
/** Sentinel used by tables to show every row on one page. */
export const PAGE_SIZE_ALL = 0;

export const STORAGE_KEYS = {
  keepAddingProducts: "pos.keepAddingProducts",
  managementSidebarCollapsed: "pos.mgmt.collapsed",
} as const;
