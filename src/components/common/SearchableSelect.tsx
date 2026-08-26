import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
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
  onCreate,
  createLabel = "Add",
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
  onCreate?: (label: string) => void;
  createLabel?: string;
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
  const cleanQuery = q.trim();
  const canCreate = Boolean(
    onCreate &&
      cleanQuery &&
      !options.some((option) => option.label.trim().toLowerCase() === cleanQuery.toLowerCase()),
  );

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

  function create() {
    if (!onCreate || !cleanQuery) return;
    onCreate(cleanQuery);
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
    <div className={cn("ui-combo [position:relative] [width:100%]", className)} ref={root}>
      <div className={cn("ui-combo-field [display:flex] [align-items:center] [gap:4px] [width:100%] [height:38px] [padding:0_8px_0_12px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]", open && "is-open", disabled && "is-disabled", invalid && "is-invalid")}>
        <input
          ref={inputRef}
          className="ui-combo-input [flex:1] [min-width:0] [height:100%] [margin:0] [padding:0] [border:0] [border-radius:0] [background:transparent] [box-shadow:none] [outline:none] [font-size:13.5px] [color:var(--ink)]"
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
              else setHi((i) => Math.min(filtered.length - 1 + (canCreate ? 1 : 0), i + 1));
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
              if (canCreate && hi === filtered.length) {
                create();
                return;
              }
              const hit = filtered[hi] ?? filtered[0];
              if (hit) pick(hit.value);
            }
          }}
        />
        <span className="ui-combo-actions [display:inline-flex] [align-items:center] [gap:2px] [color:var(--muted)] [flex-shrink:0]">
          {clearable && value && !open ? (
            <span
              role="button"
              tabIndex={-1}
              className="ui-combo-clear [display:grid] [place-items:center] [width:22px] [height:22px] [border-radius:6px]"
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
        <div className="ui-combo-menu [position:absolute] [top:calc(100%_+_6px)] [left:0] [right:0] [z-index:30] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] [box-shadow:0_12px_28px_rgba(15,_23,_42,_0.12)] [overflow:hidden]" role="listbox">
          <div className="ui-combo-list [max-height:220px] [overflow:auto] [padding:6px]">
            {filtered.length === 0 && !canCreate ? (
              <div className="ui-combo-empty [padding:18px_10px] [text-align:center] [font-size:12px] [color:var(--muted)]">{emptyMessage}</div>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className={cn("ui-combo-item [display:flex] [align-items:center] [justify-content:space-between] [gap:8px] [width:100%] [min-height:34px] [padding:0_10px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:13px] [text-align:left] [cursor:pointer]", opt.value === value && "is-on", i === hi && "is-hi")}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt.value)}
                >
                  <span>{opt.label}</span>
                  {opt.value === value ? <Check size={14} /> : null}
                </button>
              ))
            )}
            {canCreate ? (
              <button
                type="button"
                className={cn(
                  "ui-combo-item mt-1 flex min-h-9 w-full items-center gap-2 rounded-md border-0 border-t border-line bg-transparent px-2.5 text-left text-[13px] font-semibold text-accent-deep",
                  hi === filtered.length && "is-hi",
                )}
                onMouseEnter={() => setHi(filtered.length)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={create}
              >
                <Plus size={14} /> {createLabel} “{cleanQuery}”
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
