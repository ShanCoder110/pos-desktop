import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function CartUnitDropdown({
  label,
  options,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (unitId: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (options.length <= 1) {
    return <span className="cart-unit-badge">{label}</span>;
  }

  return (
    <div ref={rootRef} className="cart-unit-dd">
      <button
        type="button"
        className={`cart-unit-dd-btn ${open ? "is-open" : ""}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      {open ? (
        <div className="cart-unit-dd-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={option.id === value ? "is-active" : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onChange(option.id);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
