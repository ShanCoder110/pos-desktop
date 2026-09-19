import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { QUERY_TAB } from "@/shared/constants/query";

type TabRef = string | { id: string };

function tabId(item: TabRef) {
  return typeof item === "string" ? item : item.id;
}

export function useQueryTab(allowed: readonly TabRef[], fallback: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const ids = allowed.map(tabId);
  const raw = searchParams.get(QUERY_TAB) ?? "";
  const tab = !raw ? fallback : ids.includes(raw) || ids.length <= 1 ? raw : fallback;

  const setTab = useCallback(
    (next: string) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          params.set(QUERY_TAB, next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (searchParams.get(QUERY_TAB)) return;
    setTab(tab);
  }, [searchParams, setTab, tab]);

  return [tab, setTab] as const;
}
