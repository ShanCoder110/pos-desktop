import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const KEY = "pos.mgmt.collapsed";

const MgmtLayoutContext = createContext<{
  collapsed: boolean;
  toggle: () => void;
}>({
  collapsed: false,
  toggle: () => undefined,
});

export function MgmtLayoutProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(KEY) === "1");
  const value = useMemo(
    () => ({
      collapsed,
      toggle: () => {
        setCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem(KEY, next ? "1" : "0");
          return next;
        });
      },
    }),
    [collapsed],
  );
  return <MgmtLayoutContext.Provider value={value}>{children}</MgmtLayoutContext.Provider>;
}

export function useMgmtLayout() {
  return useContext(MgmtLayoutContext);
}
