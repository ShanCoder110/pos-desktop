import { Search, X } from "lucide-react";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { cn } from "@/utils/format";

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  searchable = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  searchable?: boolean;
}) {
  if (!searchable) return null;
  const hasValue = value.trim().length > 0;

  return (
    <div
      className={cn(
        "ui-search [position:relative] [display:flex] [align-items:center] [flex:1_1_0] [min-width:160px] [max-width:400px] [height:36px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)]",
        className,
      )}
    >
      <span
        className="ui-search-icon [display:grid] [place-items:center] [flex-shrink:0] [margin-left:10px] [color:var(--muted)] [pointer-events:none]"
        aria-hidden
      >
        <Search size={15} strokeWidth={2} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={FIELD_LIMITS.search}
      />
      {hasValue ? (
        <button
          type="button"
          className="ui-search-clear [display:grid] [place-items:center] [width:28px] [height:28px] [margin-right:4px] [border:0] [border-radius:6px] [background:transparent] [color:var(--muted)] [cursor:pointer] [flex-shrink:0]"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
