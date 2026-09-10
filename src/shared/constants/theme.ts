/**
 * Semantic color tokens mapped in `src/index.css` `@theme`.
 * Prefer Tailwind classes (`text-ink`, `bg-paper`, `border-line`, `text-sale`, `text-danger`, …)
 * or `var(--token)` — do not hardcode hex/rgb in page or component files.
 */
export const THEME_COLORS = {
  ink: "ink",
  ink2: "ink2",
  sub: "sub",
  muted: "muted",
  line: "line",
  bg: "bg",
  paper: "paper",
  header: "header",
  accent: "accent",
  accentDeep: "accent-deep",
  accentBg: "accent-bg",
  sale: "sale",
  saleBg: "sale-bg",
  hold: "hold",
  danger: "danger",
  dangerDeep: "danger-deep",
  gold: "gold",
  warn: "warn",
  shell: "shell",
} as const;

export type ThemeColor = (typeof THEME_COLORS)[keyof typeof THEME_COLORS];
