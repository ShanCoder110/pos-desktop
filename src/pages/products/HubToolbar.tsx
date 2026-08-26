import type { ReactNode } from "react";
import { ColumnPicker, type ColumnOption } from "@/components/common/ColumnPicker";
import { FilterChips, FilterPicker, type FilterChip } from "@/components/common/FilterPicker";
import { SearchInput } from "@/components/common/SearchInput";

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
  trailing,
}: {
  columns: ColumnOption[];
  cols: string[];
  onCols: (ids: string[]) => void;
  chips: FilterChip[];
  onApply: (chip: FilterChip) => void;
  onRemove: (field: string) => void;
  onClear: () => void;
  filterFields: { id: string; label: string; options?: string[]; searchable?: boolean; placeholder?: string; numeric?: boolean }[];
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      <div className="ui-toolbar-row">
        <div className="ui-toolbar-left">
          <ColumnPicker columns={columns} value={cols} onChange={onCols} />
          <FilterPicker chips={chips} onApply={onApply} fields={filterFields} />
          <SearchInput value={search} onChange={onSearch} placeholder={searchPlaceholder} />
        </div>
        {trailing ? <div className="ui-toolbar-right">{trailing}</div> : null}
      </div>
      <FilterChips items={chips} onRemove={onRemove} onClearAll={onClear} />
    </>
  );
}
