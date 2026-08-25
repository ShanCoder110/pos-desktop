import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/common/Button";
import { SelectInput } from "@/components/common/fields";

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPageSize,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPageSize?: (size: number) => void;
  onChange: (page: number) => void;
}) {
  return (
    <div className="ui-page-foot">
      <div className="ui-page-btns">
        <span className="ui-page-meta">Rows per page</span>
        {onPageSize && pageSize ? (
          <SelectInput
            value={String(pageSize)}
            onChange={(e) => onPageSize(Number(e.target.value))}
            style={{ width: 64, height: 28 }}
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectInput>
        ) : (
          <span className="ui-page-meta">{total} rows</span>
        )}
      </div>
      <div className="ui-page-btns">
        <span className="ui-page-meta">
          Page {page} of {Math.max(pages, 1)}
        </span>
        <Button size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </Button>
        <Button size="icon" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
