import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "@/utils/format";

export type ToastKind = "success" | "error" | "warn" | "info";

type ToastItem = {
  id: string;
  text: string;
  kind: ToastKind;
};

type ToastApi = {
  success: (text: string) => void;
  error: (text: string) => void;
  warn: (text: string) => void;
  info: (text: string) => void;
};

const ToastContext = createContext<ToastApi>({
  success: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
});

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <XCircle size={16} />,
  warn: <TriangleAlert size={16} />,
  info: <Info size={16} />,
};

let pushToast: ((text: string, kind: ToastKind) => void) | null = null;

export const toaster: ToastApi = {
  success: (text) => pushToast?.(text, "success"),
  error: (text) => pushToast?.(text, "error"),
  warn: (text) => pushToast?.(text, "warn"),
  info: (text) => pushToast?.(text, "info"),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (text: string, kind: ToastKind) => {
      const message = text?.trim();
      if (!message) return;
      const id = `${kind}-${message}`;
      setItems((prev) => {
        const next = prev.filter((t) => t.id !== id);
        return [...next, { id, text: message, kind }].slice(-4);
      });
      window.setTimeout(() => dismiss(id), 3000);
    },
    [dismiss],
  );

  pushToast = push;

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => push(text, "success"),
      error: (text) => push(text, "error"),
      warn: (text) => push(text, "warn"),
      info: (text) => push(text, "info"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="ui-toast-stack [position:fixed] [top:16px] [right:16px] [z-index:200] [display:grid] [gap:8px] [width:min(340px,_calc(100vw_-_32px))] [pointer-events:none]"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "ui-toast [display:flex] [align-items:flex-start] [gap:10px] [padding:12px_12px_12px_14px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] [box-shadow:0_12px_28px_rgba(15,_23,_42,_0.14)] [pointer-events:auto] [animation:ui-toast-in_0.18s_ease]",
              `is-${item.kind}`,
            )}
            role="status"
          >
            <span className="ui-toast-icon [display:grid] [place-items:center] [margin-top:1px] [color:var(--accent)]">
              {icons[item.kind]}
            </span>
            <span className="ui-toast-text [flex:1] [min-width:0] [font-size:13px] [font-weight:600] [color:var(--ink)] [line-height:1.35]">
              {item.text}
            </span>
            <button
              type="button"
              className="ui-toast-close [display:grid] [place-items:center] [width:24px] [height:24px] [border:0] [border-radius:6px] [background:transparent] [color:var(--muted)] [cursor:pointer]"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
