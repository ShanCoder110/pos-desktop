import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/common/Button";
import { PAGE_SIZE_ALL, PAGE_SIZE_OPTIONS } from "@/shared/constants/config";
import { cn } from "@/utils/format";

export { PAGE_SIZE_ALL, PAGE_SIZE_OPTIONS } from "@/shared/constants/config";

function PageSizeMenu({
  value,
  total,
  options = [...PAGE_SIZE_OPTIONS],
  showAll = true,
  onChange,
}: {
  value: number;
  total: number;
  options?: number[];
  showAll?: boolean;
  onChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const label = value === PAGE_SIZE_ALL ? "All" : String(value);

  const placeMenu = useCallback(() => {
    const anchor = root.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const rect = anchor.getBoundingClientRect();
    const menuHeight = menu.offsetHeight || 120;
    const width = Math.max(rect.width, 88);
    const above = rect.top - 6 - menuHeight;
    const below = rect.bottom + 6;
    const top = above >= 8 ? above : Math.min(below, window.innerHeight - menuHeight - 8);
    let left = rect.left;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    setCoords({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    placeMenu();
    const frame = window.requestAnimationFrame(placeMenu);
    return () => window.cancelAnimationFrame(frame);
  }, [open, placeMenu, total, options, showAll]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (root.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    const onReflow = () => placeMenu();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, placeMenu]);

  const items = [
    ...options.map((n) => ({ value: n, label: String(n) })),
    ...(showAll ? [{ value: PAGE_SIZE_ALL, label: total ? `All (${total})` : "All" }] : []),
  ];

  return (
    <div className="ui-page-size [position:relative]" ref={root}>
      <button
        type="button"
        className={cn(
          "ui-page-size-btn [display:inline-flex] [align-items:center] [justify-content:space-between] [gap:6px] [min-width:72px] [height:30px] [padding:0_8px_0_10px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:650] [cursor:pointer]",
          open && "is-open",
        )}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown size={13} />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="ui-page-size-menu [padding:4px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [box-shadow:0_-8px_24px_rgba(15,_23,_42,_0.12)]"
              role="listbox"
              style={
                coords
                  ? {
                      position: "fixed",
                      top: coords.top,
                      left: coords.left,
                      width: coords.width,
                      zIndex: 80,
                    }
                  : {
                      position: "fixed",
                      top: 0,
                      left: 0,
                      visibility: "hidden",
                      pointerEvents: "none",
                      zIndex: 80,
                    }
              }
            >
              {items.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  aria-selected={item.value === value}
                  className={cn(
                    "ui-page-size-item [display:flex] [align-items:center] [justify-content:space-between] [gap:10px] [width:100%] [min-height:30px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:600] [text-align:left] [cursor:pointer] [white-space:nowrap]",
                    item.value === value && "is-on",
                  )}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <span>{item.label}</span>
                  {item.value === value ? <Check size={13} /> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
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
  showAll = true,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPageSize?: (size: number) => void;
  onChange: (page: number) => void;
  pageSizeOptions?: number[];
  showAll?: boolean;
}) {
  const totalPages = Math.max(pages, 1);
  const current = Math.min(Math.max(page, 1), totalPages);
  const hasPrev = current > 1;
  const hasNext = current < totalPages;
  const showNavigation = totalPages > 1;

  function go(next: number) {
    onChange(Math.min(Math.max(1, next), totalPages));
  }

  return (
    <div className="ui-page-foot [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:10px_12px] [border-top:1px_solid_var(--line)] [flex-shrink:0] [flex-wrap:wrap]">
      <div className="ui-page-btns [display:flex] [align-items:center] [gap:8px] [min-width:0]">
        {onPageSize && pageSize !== undefined ? (
          <>
            <span className="ui-page-meta [font-size:12px] [color:var(--muted)] [white-space:nowrap]">
              Rows per page
            </span>
            <PageSizeMenu
              value={pageSize}
              total={total}
              options={pageSizeOptions}
              showAll={showAll}
              onChange={(size) => {
                onPageSize(size);
                onChange(1);
              }}
            />
            <span className="ui-page-meta [font-size:12px] [color:var(--muted)] [white-space:nowrap] ui-page-total [margin-left:4px]">
              {total} total
            </span>
          </>
        ) : (
          <span className="ui-page-meta [font-size:12px] [color:var(--muted)] [white-space:nowrap]">
            {total} total
          </span>
        )}
      </div>

      {showNavigation ? (
        <div className="ui-page-btns [display:flex] [align-items:center] [gap:8px] [min-width:0]">
          <span className="ui-page-meta [font-size:12px] [color:var(--muted)] [white-space:nowrap]">
            Page {current} of {totalPages}
          </span>
          <div className="ui-page-nav [display:flex] [align-items:center] [gap:4px]">
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
      ) : null}
    </div>
  );
}
