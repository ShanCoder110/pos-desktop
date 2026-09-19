import type { ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { ColumnPicker, type ColumnOption } from "@/components/common/ColumnPicker";
import {
  DateRangePeriodPicker,
  type DateRangeFilter,
} from "@/components/common/DateRangePeriodPicker";
import { FilterChips, FilterPicker, type FilterChip } from "@/components/common/FilterPicker";
import { TableSearch } from "@/components/common/TableSearch";

export type HubView = "table" | "insights";

export function HubToolbar({
  columns,
  cols,
  onCols,
  chips,
  onApply,
  onRemove,
  onClear,
  filterFields,
  search,
  onSearch,
  searchPlaceholder,
  searchable = true,
  view = "table",
  onView,
  dateRange,
  onDateRange,
  insightControls,
  trailing,
}: {
  columns: ColumnOption[];
  cols: string[];
  onCols: (ids: string[]) => void;
  chips: FilterChip[];
  onApply: (chip: FilterChip) => void;
  onRemove: (field: string) => void;
  onClear: () => void;
  filterFields: {
    id: string;
    label: string;
    options?: string[];
    searchable?: boolean;
    placeholder?: string;
    numeric?: boolean;
  }[];
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  searchable?: boolean;
  view?: HubView;
  onView?: (view: HubView) => void;
  dateRange?: DateRangeFilter;
  onDateRange?: (range: DateRangeFilter) => void;
  insightControls?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <>
      <div className="ui-toolbar-row [display:flex] [align-items:center] [justify-content:space-between] [gap:10px] [flex-wrap:wrap]">
        <div className="ui-toolbar-left [display:flex] [align-items:center] [gap:8px] [min-width:0] [flex:1]">
          <ColumnPicker columns={columns} value={cols} onChange={onCols} />
          <FilterPicker chips={chips} onApply={onApply} fields={filterFields} />
          {onView ? (
            <div className="ui-view-toggle" role="group" aria-label="View">
              <Button
                size="icon"
                className={view === "table" ? "is-on" : undefined}
                aria-label="Table view"
                aria-pressed={view === "table"}
                onClick={() => onView("table")}
              >
                <Table2 size={15} />
              </Button>
              <Button
                size="icon"
                className={view === "insights" ? "is-on" : undefined}
                aria-label="Insights"
                aria-pressed={view === "insights"}
                onClick={() => onView("insights")}
              >
                <BarChart3 size={15} />
              </Button>
            </div>
          ) : null}
          {dateRange && onDateRange ? (
            <DateRangePeriodPicker value={dateRange} onChange={onDateRange} />
          ) : null}
          <TableSearch
            searchable={searchable}
            value={search}
            onSearch={onSearch}
            placeholder={searchPlaceholder}
          />
        </div>
        {(view === "insights" && insightControls) || trailing ? (
          <div className="ui-toolbar-right [display:flex] [align-items:center] [gap:8px] [min-width:0] [flex-shrink:0]">
            {view === "insights" ? insightControls : null}
            {trailing}
          </div>
        ) : null}
      </div>
      <FilterChips items={chips} onRemove={onRemove} onClearAll={onClear} />
    </>
  );
}
