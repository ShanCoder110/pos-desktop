import { useEffect, useRef, useState } from "react";
import { TABLE_SEARCH_DEBOUNCE_MS } from "@/shared/constants/config";
import { SearchInput } from "@/components/common/SearchInput";

export function TableSearch({
  value,
  onSearch,
  placeholder,
  className,
  searchable = true,
  debounceMs = TABLE_SEARCH_DEBOUNCE_MS,
}: {
  value: string;
  onSearch: (query: string) => void;
  placeholder: string;
  className?: string;
  searchable?: boolean;
  debounceMs?: number;
}) {
  const [draft, setDraft] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function changeQuery(nextValue: string) {
    setDraft(nextValue);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const normalized = nextValue.trim();
    if (!normalized) {
      onSearchRef.current("");
      return;
    }

    timeoutRef.current = setTimeout(() => {
      onSearchRef.current(normalized);
    }, debounceMs);
  }

  return (
    <SearchInput
      value={draft}
      onChange={changeQuery}
      placeholder={placeholder}
      className={className}
      searchable={searchable}
    />
  );
}
