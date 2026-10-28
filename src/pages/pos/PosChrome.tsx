import { Skeleton } from "@/components/common/Skeleton";

export function PosLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-50 grid grid-cols-[1fr_360px] gap-2 bg-shell p-2"
      aria-label="Loading POS"
    >
      <div className="grid min-h-0 grid-rows-[48px_1fr] gap-2">
        <Skeleton className="h-12 rounded-lg" />
        <div className="rounded-lg border border-line bg-paper p-3">
          <Skeleton className="mb-4 h-8 rounded-md" />
          <div className="grid gap-3">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-9 rounded-md" />
            ))}
          </div>
        </div>
      </div>
      <div className="grid content-start gap-2">
        <Skeleton className="h-8 rounded-md" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-36 rounded-lg" />
      </div>
    </div>
  );
}

const FUNCTION_KEYS = [
  ["F1", "Help"],
  ["F2", "Customer"],
  ["F3", "Search"],
  ["F4", "Hold"],
  ["F5", "Clear"],
  ["F6", "Cart"],
  ["F7", "Exact"],
  ["F8", "Discount"],
  ["F9", "Print"],
  ["F10", "Split"],
  ["F11", "R/W/MIN"],
  ["F12", "Sale"],
] as const;

export function PosFunctionBar({
  splitPrint,
  onFunction,
}: {
  splitPrint: boolean;
  onFunction: (key: (typeof FUNCTION_KEYS)[number][0]) => void;
}) {
  return (
    <footer className="fnbar [grid-column:2] [grid-row:2] [display:grid] [grid-template-columns:repeat(12,_1fr)] [background:var(--header)] [color:#94a3b8] [overflow:hidden]">
      {FUNCTION_KEYS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          data-fn={key}
          className={key === "F10" && splitPrint ? "is-on" : undefined}
          onClick={() => onFunction(key)}
        >
          <kbd>{key}</kbd>
          <span>{label}</span>
        </button>
      ))}
    </footer>
  );
}

export function PosBillsMenu({
  open,
  heldCount,
  onHeld,
  onRecent,
}: {
  open: boolean;
  heldCount: number;
  onHeld: () => void;
  onRecent: () => void;
}) {
  return (
    <div
      className="bills-tip [position:fixed] [z-index:36] [min-width:220px] [padding:6px] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_10px_28px_rgba(15,23,42,.18)] [display:grid] [gap:4px]"
      hidden={!open}
      style={{ right: 16, bottom: 52 }}
    >
      <button type="button" onClick={onHeld}>
        <span>Held invoices</span>
        <em>{heldCount}</em>
      </button>
      <button type="button" onClick={onRecent}>
        <span>Recent invoices</span>
      </button>
    </div>
  );
}
