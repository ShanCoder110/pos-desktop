import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Package, Search, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import type { Product } from "@/shared/types";
import { cn } from "@/utils/format";

export function ProductSearch({
  products,
  value,
  onChange,
  placeholder = "Search name, SKU, or barcode",
  autoFocus = false,
  invalid = false,
  disabled = false,
  clearable = false,
  name = "product",
  maxResults = 8,
}: {
  products: Product[];
  value: string;
  onChange: (product: Product | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  name?: string;
  maxResults?: number;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const debouncedQuery = useDebounce(query, 160);
  const selected = products.find((product) => product.id === value);

  const results = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    const matches = needle
      ? products.filter((product) =>
          `${product.name} ${product.sku} ${product.barcode ?? ""} ${product.category}`
            .toLowerCase()
            .includes(needle),
        )
      : products;
    return matches.slice(0, maxResults);
  }, [debouncedQuery, maxResults, products]);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = results.findIndex((product) => product.id === value);
    setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, results, value]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function pick(product: Product) {
    onChange(product);
    close();
  }

  return (
    <div
      ref={rootRef}
      className={cn("product-search relative w-full", open && "is-open")}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          "product-search-field flex h-11 w-full items-center gap-2 rounded-lg border bg-paper px-3 transition-[border-color,box-shadow]",
          open ? "border-accent shadow-[0_0_0_3px_var(--accent-ring)]" : "border-line",
          invalid && "!border-danger shadow-[0_0_0_3px_rgba(220,38,38,0.12)]",
          disabled && "cursor-not-allowed bg-slate-100 opacity-70",
        )}
      >
        <Search className="shrink-0 text-muted" size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          data-field={name}
          autoFocus={autoFocus}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[highlighted] ? `${listId}-${results[highlighted].id}` : undefined}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none shadow-none"
          placeholder={placeholder}
          value={open ? query : selected ? `${selected.name} · ${selected.sku}` : query}
          onFocus={() => {
            if (disabled) return;
            inputRef.current?.select();
          }}
          onClick={() => {
            if (disabled || open) return;
            setQuery("");
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              close();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
              setHighlighted((index) => Math.min(Math.max(results.length - 1, 0), index + 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
              setHighlighted((index) => Math.max(0, index - 1));
              return;
            }
            if (event.key === "Enter" && open) {
              event.preventDefault();
              event.stopPropagation();
              const product = results[highlighted] ?? results[0];
              if (product) pick(product);
              return;
            }
            if (event.key === "Tab" && open && query.trim()) {
              const product = results[highlighted] ?? results[0];
              if (product) {
                onChange(product);
                close();
              }
            }
          }}
        />
        {selected && !open ? (
          <span className="hidden shrink-0 rounded-md bg-accent-bg px-2 py-1 text-[10px] font-bold text-accent-deep sm:inline">
            {selected.category}
          </span>
        ) : null}
        {clearable && selected && !open ? (
          <button
            type="button"
            tabIndex={-1}
            className="grid size-6 shrink-0 place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-bg hover:text-ink"
            onClick={() => {
              onChange(null);
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear product"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-40 overflow-hidden rounded-xl border border-line bg-paper p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.16)]"
        >
          {results.length ? (
            <div className="grid max-h-[304px] gap-0.5 overflow-y-auto">
              {results.map((product, index) => (
                <button
                  id={`${listId}-${product.id}`}
                  key={product.id}
                  type="button"
                  role="option"
                  aria-selected={product.id === value}
                  tabIndex={-1}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg border-0 px-2.5 py-2 text-left",
                    index === highlighted ? "bg-accent-bg" : "bg-transparent hover:bg-bg",
                  )}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(product)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-bg text-sub">
                    <Package size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[12px] font-bold text-ink">{product.name}</strong>
                    <small className="mt-0.5 block truncate text-[10px] text-muted">
                      {product.sku} · {product.category} · {product.stock} {unitLabelForProduct(product)}
                    </small>
                  </span>
                  {product.id === value ? <Check className="shrink-0 text-accent" size={15} /> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid place-items-center gap-1 px-3 py-7 text-center">
              <Package className="text-muted" size={20} />
              <strong className="text-[12px] text-ink">No product found</strong>
              <span className="text-[10px] text-muted">Try a name, SKU, or barcode</span>
            </div>
          )}
          <p className="border-t border-line px-2 pt-1.5 text-[9px] text-muted">
            ↑↓ Navigate · Enter Select · Esc Close
          </p>
        </div>
      ) : null}
    </div>
  );
}

function unitLabelForProduct(product: Product) {
  return product.unit || "unit";
}
