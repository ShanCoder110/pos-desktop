import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/utils/format";

export type UnitSegmentOption = {
  id: string;
  label: string;
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
              "flex-1 rounded-md border-0 px-2 font-bold transition-colors",
              compact ? "min-h-6 text-[10px]" : "min-h-7 text-[11px]",
              active ? "bg-accent text-white" : "bg-transparent text-sub hover:bg-bg",
            )}
            onClick={() => onChange(unit.id)}
            onKeyDown={(event) => {
              onKeyDown?.(event, index);
              if (!event.defaultPrevented) moveSelection(event, index, units, onChange);
            }}
          >
            {unit.label}
          </button>
        );
      })}
    </div>
  );
}
