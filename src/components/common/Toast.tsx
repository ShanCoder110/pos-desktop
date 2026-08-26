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
      const id = `${kind}-${text}`;
      setItems((prev) => {
        const next = prev.filter((t) => t.id !== id);
        return [...next, { id, text, kind }].slice(-4);
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
      <div className="ui-toast-stack" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={cn("ui-toast", `is-${item.kind}`)} role="status">
            <span className="ui-toast-icon">{icons[item.kind]}</span>
            <span className="ui-toast-text">{item.text}</span>
            <button type="button" className="ui-toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss">
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
