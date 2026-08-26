import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/utils/format";

export type TabItem = {
  id: string;
  label: string;
  kbd?: string;
  to?: string;
  end?: boolean;
};

export function Tabs({
  items,
  value,
  onChange,
  variant = "folder",
  ariaLabel = "Tabs",
  skipTabOrder = false,
}: {
  items: readonly TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  variant?: "folder" | "line";
  ariaLabel?: string;
  skipTabOrder?: boolean;
}) {
  return (
    <nav className={cn("ui-tabs", variant === "folder" && "is-folder")} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const label = (
          <>
            {item.label}
            {item.kbd ? <kbd className="ui-kbd">{item.kbd}</kbd> : null}
          </>
        );
        if (item.to) {
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              role="tab"
              className={({ isActive }) => (isActive ? "ui-tab is-on" : "ui-tab")}
            >
              {label}
            </NavLink>
          );
        }
        const on = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={skipTabOrder ? -1 : on ? 0 : -1}
            className={on ? "ui-tab is-on" : "ui-tab"}
            onClick={() => onChange?.(item.id)}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export function TabSheet({ tabs, children }: { tabs: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-tab-sheet">
      {tabs}
      <div className="ui-tab-sheet-body">{children}</div>
    </div>
  );
}
