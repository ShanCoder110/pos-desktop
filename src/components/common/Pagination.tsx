import { useEffect, useRef, useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/common/Button";
import { cn } from "@/utils/format";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
/** Sentinel: show every row on one page */
export const PAGE_SIZE_ALL = 0;

function PageSizeMenu({
  value,
  total,
  options = [...PAGE_SIZE_OPTIONS],
  onChange,
}: {
  value: number;
  total: number;
  options?: number[];
  onChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const label = value === PAGE_SIZE_ALL ? "All" : String(value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const items = [
    ...options.map((n) => ({ value: n, label: String(n) })),
    { value: PAGE_SIZE_ALL, label: total ? `All (${total})` : "All" },
  ];

  return (
    <div className="ui-page-size" ref={root}>
      <button
        type="button"
        className={cn("ui-page-size-btn", open && "is-open")}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown size={13} />
      </button>
      {open ? (
        <div className="ui-page-size-menu" role="listbox">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={cn("ui-page-size-item", item.value === value && "is-on")}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.value === value ? <Check size={13} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageSize,
  onChange,
  pageSizeOptions = [...PAGE_SIZE_OPTIONS],
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPageSize?: (size: number) => void;
  onChange: (page: number) => void;
  pageSizeOptions?: number[];
}) {
  const totalPages = Math.max(pages, 1);
  const current = Math.min(Math.max(page, 1), totalPages);
  const hasPrev = current > 1;
  const hasNext = current < totalPages;

  function go(next: number) {
    onChange(Math.min(Math.max(1, next), totalPages));
  }

  return (
    <div className="ui-page-foot">
      <div className="ui-page-btns">
        {onPageSize && pageSize !== undefined ? (
          <>
            <span className="ui-page-meta">Rows per page</span>
            <PageSizeMenu
              value={pageSize}
              total={total}
              options={pageSizeOptions}
              onChange={(size) => {
                onPageSize(size);
                onChange(1);
              }}
            />
            <span className="ui-page-meta ui-page-total">{total} total</span>
          </>
        ) : (
          <span className="ui-page-meta">{total} total</span>
        )}
      </div>

      <div className="ui-page-btns">
        <span className="ui-page-meta">
          Page {current} of {totalPages}
        </span>
        <div className="ui-page-nav">
          <Button
            size="icon"
            disabled={!hasPrev}
            onClick={() => go(1)}
            aria-label="First page"
            title="First page"
          >
            <ChevronsLeft size={14} />
          </Button>
          <Button
            size="icon"
            disabled={!hasPrev}
            onClick={() => go(current - 1)}
            aria-label="Previous page"
            title="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="icon"
            disabled={!hasNext}
            onClick={() => go(current + 1)}
            aria-label="Next page"
            title="Next page"
          >
            <ChevronRight size={14} />
          </Button>
          <Button
            size="icon"
            disabled={!hasNext}
            onClick={() => go(totalPages)}
            aria-label="Last page"
            title="Last page"
          >
            <ChevronsRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
