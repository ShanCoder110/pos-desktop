export type DrawerSize = "sm" | "md" | "lg" | "xl";

/** Side drawer panel widths (used by `Drawer` size prop). */
export const DRAWER_SIZES = {
  sm: 360,
  md: 420,
  lg: 560,
  xl: 720,
} as const;
