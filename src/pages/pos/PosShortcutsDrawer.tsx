type PosShortcutKey =
  "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9" | "F10" | "F11" | "F12" | "Unit";

type PosShortcutAction = {
  id: string;
  label: string;
  hint: string;
  shortcut?: string;
  onRun: () => void;
};

export function PosShortcutsDrawer({
  open,
  onClose,
  onFunction,
  onAddCustomer,
  onAddProduct,
  onDashboard,
}: {
  open: boolean;
  onClose: () => void;
  onFunction: (key: PosShortcutKey) => void;
  onAddCustomer: () => void;
  onAddProduct: () => void;
  onDashboard: () => void;
}) {
  if (!open) return null;

  const functionAction = (
    id: string,
    label: string,
    hint: string,
    key: PosShortcutKey,
    shortcut: string = key,
  ): PosShortcutAction => ({ id, label, hint, shortcut, onRun: () => onFunction(key) });
  const actions: PosShortcutAction[] = [
    functionAction("help", "Shortcut help", "Show the keyboard summary", "F1"),
    functionAction("customer", "Choose customer", "Search or select the customer", "F2"),
    functionAction("search", "Find product", "Search product, SKU or barcode", "F3"),
    functionAction("hold", "Hold bill", "Save this bill and continue later", "F4"),
    functionAction("clear", "Clear cart", "Remove all products from this bill", "F5"),
    functionAction("cart", "Focus cart", "Move focus to the first cart item", "F6"),
    functionAction("exact", "Exact payment", "Fill the payable amount", "F7"),
    functionAction("discount", "Bill discount", "Focus the discount field", "F8"),
    functionAction("print", "Preview and print", "Open the receipt preview", "F9"),
    functionAction("split-print", "Split print", "Toggle split printing", "F10"),
    functionAction("prices", "Retail / Wholesale", "Switch prices for every cart line", "F11"),
    functionAction("complete", "Complete sale", "Validate and save the invoice", "F12"),
    {
      id: "add-customer",
      label: "Add customer",
      hint: "Create and select a new customer",
      shortcut: "Ctrl+N",
      onRun: onAddCustomer,
    },
    functionAction("unit", "Choose unit", "Focus the available product units", "Unit", "U"),
    { id: "products", label: "Add product", hint: "Open product management", onRun: onAddProduct },
    { id: "dashboard", label: "Dashboard", hint: "Leave POS", onRun: onDashboard },
  ];

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="POS shortcuts"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-black/45"
        aria-label="Close shortcuts"
        onClick={onClose}
      />
      <aside className="absolute bottom-0 right-0 top-0 flex w-[min(390px,92vw)] flex-col border-l border-line bg-paper shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[18px] font-extrabold text-ink">POS shortcuts</h2>
            <p className="mt-0.5 text-[11px] text-muted">Click an action or use its key</p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-bg text-[20px] text-muted hover:text-ink"
            aria-label="Close shortcuts"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="grid flex-1 content-start gap-2 overflow-y-auto p-4">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="group grid min-h-14 grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-bg px-4 py-3 text-left transition hover:border-accent hover:bg-accent-bg"
              onClick={() => {
                onClose();
                action.onRun();
              }}
            >
              <span className="min-w-0">
                <strong className="block text-[13px] font-bold text-ink">{action.label}</strong>
                <small className="mt-0.5 block text-[10px] font-normal text-muted">
                  {action.hint}
                </small>
              </span>
              {action.shortcut ? (
                <kbd className="rounded-md border border-line bg-paper px-2 py-1 font-mono text-[10px] font-bold text-sub group-hover:border-accent/50">
                  {action.shortcut}
                </kbd>
              ) : (
                <span className="text-[16px] text-muted">›</span>
              )}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
