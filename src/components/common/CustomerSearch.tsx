import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Search, UserRound, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import type { DomainCustomer } from "@/shared/domain/types";
import { cn, creditState, money } from "@/utils/format";
import { formatPkMobile } from "@/utils/phone";

export function CustomerSearch({
  customers,
  value,
  onChange,
  placeholder = "Search by name or phone",
  emptyMessage = "No customer found",
  autoFocus = false,
  maxResults = 6,
}: {
  customers: DomainCustomer[];
  value: string;
  onChange: (customer: DomainCustomer | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  autoFocus?: boolean;
  maxResults?: number;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const debouncedQuery = useDebounce(query, 160);
  const selected = customers.find((customer) => customer.id === value) ?? null;
  const pending = query.trim() !== debouncedQuery.trim();

  const recent = useMemo(
    () =>
      [...customers]
        .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""))
        .slice(0, 5),
    [customers],
  );
  const results = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    if (!needle) return recent;
    return customers
      .filter((customer) =>
        `${customer.name} ${customer.phone} ${customer.address}`.toLowerCase().includes(needle),
      )
      .slice(0, maxResults);
  }, [customers, debouncedQuery, maxResults, recent]);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

  useEffect(() => {
    if (open) setHighlighted(0);
  }, [debouncedQuery, open]);

  function clear() {
    onChange(null);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(customer: DomainCustomer) {
    onChange(customer);
    setQuery("");
    setOpen(false);
  }

  if (selected) {
    const balance = creditState(selected.currentBalance);
    return (
      <div className="grid gap-2 rounded-xl border border-accent/30 bg-accent-bg/50 p-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-white">
            <UserRound size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[13px] text-ink">{selected.name}</strong>
            <small className="block truncate text-[10px] text-muted">
              {selected.phone ? formatPkMobile(selected.phone) : "No phone"}
              {selected.address ? ` · ${selected.address}` : ""}
            </small>
          </span>
          <span className="shrink-0 text-right">
            <small className="block text-[9px] font-bold uppercase tracking-wide text-muted">
              Balance
            </small>
            <strong
              className={cn(
                "text-[11px]",
                selected.currentBalance > 0
                  ? "text-danger"
                  : selected.currentBalance < 0
                    ? "text-sale"
                    : "text-muted",
              )}
            >
              {balance.text}
            </strong>
          </span>
          <button
            type="button"
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-paper text-muted hover:text-ink"
            onClick={clear}
            aria-label="Change customer"
            title="Change customer"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative" onClick={(event) => event.stopPropagation()}>
      <label
        className={cn(
          "flex h-10 items-center gap-2 rounded-xl border bg-paper px-3 transition-[border-color,box-shadow]",
          open ? "border-accent shadow-[0_0_0_3px_var(--accent-ring)]" : "border-line",
        )}
      >
        <Search size={15} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[highlighted] ? `${listId}-${results[highlighted].id}` : undefined
          }
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlighted((index) => Math.min(Math.max(results.length - 1, 0), index + 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((index) => Math.max(0, index - 1));
              return;
            }
            if (event.key === "Enter" && open) {
              event.preventDefault();
              const customer = results[highlighted] ?? results[0];
              if (customer) pick(customer);
            }
          }}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none"
        />
        {pending ? (
          <span
            className="pb-1 text-[14px] font-bold tracking-widest text-muted"
            aria-label="Searching"
          >
            …
          </span>
        ) : query ? (
          <button
            type="button"
            className="grid size-6 place-items-center border-0 bg-transparent text-muted hover:text-ink"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        ) : null}
      </label>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="ui-search-popover absolute top-[calc(100%+6px)] right-0 left-0 z-40 overflow-hidden rounded-xl border border-line bg-paper p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.16)]"
        >
          {!query.trim() && results.length ? (
            <p className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">
              Recent customers
            </p>
          ) : null}
          {results.length ? (
            <div className="grid max-h-[260px] gap-0.5 overflow-y-auto">
              {results.map((customer, index) => {
                const balance = creditState(customer.currentBalance);
                return (
                  <button
                    id={`${listId}-${customer.id}`}
                    key={customer.id}
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    tabIndex={-1}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-lg border-0 px-2.5 py-2 text-left",
                      index === highlighted ? "bg-accent-bg" : "bg-transparent hover:bg-bg",
                    )}
                    onMouseEnter={() => setHighlighted(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(customer)}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-bg text-sub">
                      <UserRound size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[12px] text-ink">
                        {customer.name}
                      </strong>
                      <small className="block truncate text-[10px] text-muted">
                        {customer.phone ? formatPkMobile(customer.phone) : "No phone"}
                        {customer.address ? ` · ${customer.address}` : ""}
                      </small>
                    </span>
                    <span className="shrink-0 text-right">
                      <small className="block text-[9px] text-muted">Balance</small>
                      <strong className="text-[10px] text-sub">
                        {customer.currentBalance === 0 ? money(0) : balance.text}
                      </strong>
                    </span>
                    <Check size={14} className="text-accent" />
                  </button>
                );
              })}
            </div>
          ) : pending ? (
            <div className="px-3 py-5 text-center text-[11px] text-muted">Searching…</div>
          ) : (
            <div className="grid place-items-center gap-1 px-3 py-6 text-center">
              <UserRound className="text-muted" size={20} />
              <strong className="text-[12px] text-ink">{emptyMessage}</strong>
              <small className="text-[10px] text-muted">Try another name or phone number</small>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
