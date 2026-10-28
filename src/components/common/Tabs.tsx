import { useId, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/utils/format";

export type TabItem = {
  id: string;
  label: string;
  tone?: "recipe";
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
  idPrefix,
  panelId,
}: {
  items: readonly TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  variant?: "folder" | "line";
  ariaLabel?: string;
  skipTabOrder?: boolean;
  idPrefix?: string;
  panelId?: string;
}) {
  const generatedId = useId();
  const tabsId = idPrefix ?? generatedId;
  const noSelection = !items.some((item) => item.id === value);
  return (
    <nav
      className={cn(
        "ui-tabs [display:flex] [gap:18px] [width:100%] [border-bottom:1px_solid_var(--line)] [flex-shrink:0]",
        variant === "folder" && "is-folder",
      )}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (
          !onChange ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
        ];
        const current = buttons.indexOf(event.target as HTMLButtonElement);
        if (current < 0) return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        const id = buttons[next]?.dataset.tabId;
        if (id) onChange(id);
        requestAnimationFrame(() => buttons[next]?.focus());
      }}
    >
      {items.map((item, index) => {
        const label = (
          <>
            {item.label}
            {item.kbd ? (
              <kbd className="ui-kbd [display:inline-flex] [align-items:center] [height:18px] [padding:0_5px] [border:1px_solid_var(--line)] [border-radius:4px] [background:var(--bg)] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:700] [letter-spacing:0.02em] [color:var(--muted)]">
                {item.kbd}
              </kbd>
            ) : null}
          </>
        );
        if (item.to) {
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              role="tab"
              className={({ isActive }) =>
                isActive
                  ? "ui-tab [position:relative] [display:inline-flex] [align-items:center] [gap:6px] [height:36px] [padding:0] [border:0] [background:transparent] [color:var(--ink)] [font-size:13px] [font-weight:600] [cursor:pointer] [text-decoration:none] [white-space:nowrap] is-on"
                  : "ui-tab [position:relative] [display:inline-flex] [align-items:center] [gap:6px] [height:36px] [padding:0] [border:0] [background:transparent] [color:var(--ink)] [font-size:13px] [font-weight:600] [cursor:pointer] [text-decoration:none] [white-space:nowrap]"
              }
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
            id={`${tabsId}-tab-${item.id}`}
            data-tab-id={item.id}
            aria-controls={on ? panelId : undefined}
            aria-selected={on}
            tabIndex={skipTabOrder ? -1 : on || (noSelection && index === 0) ? 0 : -1}
            className={cn(
              "ui-tab [position:relative] [display:inline-flex] [align-items:center] [gap:6px] [height:36px] [padding:0] [border:0] [background:transparent] [color:var(--ink)] [font-size:13px] [font-weight:600] [cursor:pointer] [text-decoration:none] [white-space:nowrap]",
              on && "is-on",
              item.tone === "recipe" &&
                (on ? "!text-violet-700 !shadow-[inset_0_-2px_0_#7c3aed]" : "!text-violet-500"),
            )}
            onClick={() => onChange?.(item.id)}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export function TabSheet({ tabs, children }: { tabs?: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-tab-sheet [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
      {tabs}
      <div className="ui-tab-sheet-body [flex:1] [min-height:0] [min-width:0] [display:flex] [flex-direction:column] [overflow:hidden]">
        {children}
      </div>
    </div>
  );
}
