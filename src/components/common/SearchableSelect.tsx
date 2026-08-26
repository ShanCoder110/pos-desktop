import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/utils/format";

export type SelectOption = { value: string; label: string };

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  clearable = true,
  disabled = false,
  emptyMessage = "No matches",
  className,
  invalid,
  name,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
  invalid?: boolean;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle));
  }, [options, q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, filtered.findIndex((o) => o.value === value)));
  }, [open, filtered, value]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQ("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function openMenu(query = "") {
    if (disabled) return;
    setQ(query);
    setOpen(true);
  }

  return (
    <div className={cn("ui-combo", className)} ref={root}>
      <div className={cn("ui-combo-field", open && "is-open", disabled && "is-disabled", invalid && "is-invalid")}>
        <input
          ref={inputRef}
          className="ui-combo-input"
          disabled={disabled}
          placeholder={open ? searchPlaceholder : placeholder}
          data-field={name}
          value={open ? q : selected?.label ?? ""}
          onChange={(e) => openMenu(e.target.value)}
          onFocus={() => {
            if (!open) setQ("");
          }}
          onClick={() => {
            if (!open) openMenu("");
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Escape") {
              if (open) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setQ("");
              }
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              e.stopPropagation();
              if (!open) openMenu("");
              else setHi((i) => Math.min(filtered.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              e.stopPropagation();
              if (open) setHi((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Enter") {
              if (!open) return;
              e.preventDefault();
              e.stopPropagation();
              const hit = filtered[hi] ?? filtered[0];
              if (hit) pick(hit.value);
            }
          }}
        />
        <span className="ui-combo-actions">
          {clearable && value && !open ? (
            <span
              role="button"
              tabIndex={-1}
              className="ui-combo-clear"
              aria-label="Clear"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                setQ("");
                inputRef.current?.focus();
              }}
            >
              <X size={13} />
            </span>
          ) : null}
          <ChevronDown size={14} />
        </span>
      </div>
      {open ? (
        <div className="ui-combo-menu" role="listbox">
          <div className="ui-combo-list">
            {filtered.length === 0 ? (
              <div className="ui-combo-empty">{emptyMessage}</div>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={cn("ui-combo-item", opt.value === value && "is-on", i === hi && "is-hi")}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt.value)}
                >
                  <span>{opt.label}</span>
                  {opt.value === value ? <Check size={14} /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
