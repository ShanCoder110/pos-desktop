import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/utils/format";

export type UnitSegmentOption = {
  id: string;
  label: string;
  meta?: string;
  tone?: "default" | "danger" | "warning";
};

function moveSelection(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  index: number,
  units: UnitSegmentOption[],
  onChange: (unitId: string) => void,
) {
  if (!units.length) return;
  let nextIndex = index;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (index + 1) % units.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (index - 1 + units.length) % units.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = units.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  onChange(units[nextIndex].id);
  const group = event.currentTarget.parentElement;
  requestAnimationFrame(() =>
    group?.querySelectorAll<HTMLButtonElement>("button")[nextIndex]?.focus(),
  );
}

/** Shared keyboard-friendly unit selector for POS, credit, recipes, lots and transfers. */
export function UnitSegmentedControl({
  units,
  value,
  onChange,
  ariaLabel = "Quantity unit",
  className,
  compact = false,
  onButtonRef,
  onKeyDown,
}: {
  units: UnitSegmentOption[];
  value: string;
  onChange: (unitId: string) => void;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  onButtonRef?: (unitId: string, element: HTMLButtonElement | null) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border border-line bg-paper p-1",
        compact ? "min-h-8" : "min-h-9",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {units.map((unit, index) => {
        const active = unit.id === value;
        return (
          <button
            key={unit.id}
            ref={(element) => onButtonRef?.(unit.id, element)}
            type="button"
            tabIndex={active ? 0 : -1}
            aria-pressed={active}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center rounded-md border px-2 font-bold transition-colors",
              compact ? "min-h-6 text-[10px]" : "min-h-7 text-[11px]",
              active
                ? unit.tone === "danger"
                  ? "border-danger bg-danger text-white"
                  : unit.tone === "warning"
                    ? "border-warn bg-warn text-white"
                    : "border-accent bg-accent text-white"
                : unit.tone === "danger"
                  ? "border-danger/45 bg-danger/10 text-danger hover:bg-danger/15"
                  : unit.tone === "warning"
                    ? "border-warn/45 bg-warn/10 text-warn-ink hover:bg-warn/15"
                    : "border-transparent bg-transparent text-sub hover:bg-bg",
            )}
            onClick={() => onChange(unit.id)}
            onKeyDown={(event) => {
              onKeyDown?.(event, index);
              if (!event.defaultPrevented) moveSelection(event, index, units, onChange);
            }}
          >
            <span className="truncate">{unit.label}</span>
            {unit.meta ? (
              <small
                className={cn("text-[8px] leading-none", active ? "text-white/85" : "opacity-80")}
              >
                {unit.meta}
              </small>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
