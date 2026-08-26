import { Search, X } from "lucide-react";
import { cn } from "@/utils/format";

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const hasValue = value.trim().length > 0;

  return (
    <div className={cn("ui-search", className)}>
      <span className="ui-search-icon" aria-hidden>
        <Search size={15} strokeWidth={2} />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
      />
      {hasValue ? (
        <button type="button" className="ui-search-clear" onClick={() => onChange("")} aria-label="Clear search">
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
