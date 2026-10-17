import type { KeyboardEvent, RefObject } from "react";
import {
  UnitSegmentedControl,
  type UnitSegmentOption,
} from "@/components/common/UnitSegmentedControl";

export function PosSaleEntryControls({
  hasProduct,
  unitFocused,
  units,
  unitId,
  priceMode,
  quantity,
  quantityHint,
  quantityInputRef,
  onCategory,
  onUnit,
  onUnitRef,
  onUnitKeyDown,
  onPriceMode,
  onQuantity,
  onQuantityKeyDown,
  onAdd,
}: {
  hasProduct: boolean;
  unitFocused: boolean;
  units: UnitSegmentOption[];
  unitId: string;
  priceMode: "retail" | "wholesale";
  quantity: string;
  quantityHint: { cls: string; lines: string[] } | null;
  quantityInputRef: RefObject<HTMLInputElement | null>;
  onCategory: () => void;
  onUnit: (unitId: string) => void;
  onUnitRef: (unitId: string, element: HTMLButtonElement | null) => void;
  onUnitKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPriceMode: (mode: "retail" | "wholesale") => void;
  onQuantity: (value: string) => void;
  onQuantityKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="cat-btn inline-flex shrink-0 items-center justify-center gap-1.5 self-stretch whitespace-nowrap rounded-md border border-[#c7d2fe] bg-paper px-3 text-[13px] font-semibold text-sub"
        onClick={onCategory}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3.5 6.5h5l1.2 1.5H16.5v7.5H3.5V6.5z" />
          <path d="M3.5 6.5V5.2A1.2 1.2 0 014.7 4h3.1l1.2 1.5" />
        </svg>
        <span>Categories</span>
        <kbd>⇧F3</kbd>
      </button>

      <div
        className={`unit-box flex min-w-[186px] shrink-0 flex-col justify-center rounded-md border border-[#99f6e4] bg-[#f0fdfa] px-1.5 pb-1 pt-0.5 ${unitFocused ? "is-focus" : ""}`}
        hidden={!hasProduct}
      >
        <span className="qty-label flex items-center justify-between text-[10px] font-bold tracking-[.06em] text-gold">
          UNIT FIRST <kbd>U · ← →</kbd>
        </span>
        <UnitSegmentedControl
          units={units}
          value={unitId}
          onChange={onUnit}
          onButtonRef={onUnitRef}
          onKeyDown={onUnitKeyDown}
          className="unit-toggles border-0 bg-transparent p-0"
          compact
        />
      </div>

      <div
        className="price-mode flex shrink-0 self-stretch rounded-md border border-[#c7d2fe] bg-paper p-[3px]"
        role="group"
        aria-label="Default price for search and new lines"
      >
        {(["retail", "wholesale"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`mode-btn inline-flex min-w-[72px] flex-col items-center justify-center rounded-[5px] border-0 bg-transparent px-2.5 text-[12px] font-semibold capitalize text-sub ${priceMode === mode ? "is-active" : ""}`}
            onClick={() => onPriceMode(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="qty-box relative flex w-[88px] shrink-0 flex-col justify-center rounded-md border border-[#fcd34d] bg-[#fffbeb] px-2 pb-1 pt-0.5">
        <span className="qty-label flex items-center justify-between text-[10px] font-bold tracking-[.06em] text-gold">
          QTY <kbd>↵</kbd>
        </span>
        <input
          ref={quantityInputRef}
          id="qtyInput"
          type="number"
          min={0.001}
          step="any"
          value={quantity}
          onChange={(event) => onQuantity(event.target.value)}
          onKeyDown={onQuantityKeyDown}
        />
        <span
          className={`qty-hint absolute right-0 top-[calc(100%+3px)] z-20 flex min-w-full flex-col items-end gap-px whitespace-nowrap rounded border border-[#fcd34d] bg-[#fffbeb] px-1.5 py-[3px] text-right font-mono text-[10px] font-bold leading-tight text-[#854d0e] shadow-md ${quantityHint?.cls || ""}`}
          hidden={!quantityHint}
        >
          {quantityHint?.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </div>

      <button
        type="button"
        className="btn-add inline-flex w-24 shrink-0 items-center justify-center gap-1 rounded-md border-0 bg-accent text-[13px] font-bold text-white"
        id="btnAdd"
        onClick={onAdd}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 4v12M4 10h12" />
        </svg>
        Add ↵
      </button>
    </>
  );
}
