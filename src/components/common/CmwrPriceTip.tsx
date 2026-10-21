import { Tooltip } from "@/components/common/Tooltip";
import { moneyNum } from "@/utils/format";
import type { ReactElement } from "react";

export type CmwrPrices = {
  cost?: number;
  min?: number;
  wholesale?: number;
  price?: number;
};

export function formatCmwrPrices(unit: CmwrPrices) {
  const c = Number(unit.cost) || 0;
  const m = Number(unit.min) || 0;
  const w = Number(unit.wholesale) || 0;
  const r = Number(unit.price) || 0;
  return `C ${moneyNum(c)} · M ${moneyNum(m)} · W ${moneyNum(w)} · R ${moneyNum(r)}`;
}

function CmwrTipBody({ unit }: { unit: CmwrPrices }) {
  const rows = [
    { key: "C", value: Number(unit.cost) || 0 },
    { key: "M", value: Number(unit.min) || 0 },
    { key: "W", value: Number(unit.wholesale) || 0 },
    { key: "R", value: Number(unit.price) || 0 },
  ] as const;
  return (
    <span className="cmwr-tip [display:inline-flex] [align-items:center] [gap:0] [font-family:var(--mono,_ui-monospace,_monospace)] [font-size:10px] [font-weight:650] [letter-spacing:0.01em] [white-space:nowrap] [line-height:1.2]">
      {rows.map((row, index) => (
        <span key={row.key} className="[display:inline-flex] [align-items:center]">
          {index > 0 ? (
            <span className="[padding:0_6px] [opacity:0.35] [font-weight:500]" aria-hidden>
              ·
            </span>
          ) : null}
          <span className="[display:inline-flex] [align-items:baseline] [gap:3px]">
            <em className="[font-style:normal] [opacity:0.65] [font-size:9px] [font-weight:700] [min-width:0.65em]">
              {row.key}
            </em>
            <span className="[font-variant-numeric:tabular-nums]">{moneyNum(row.value)}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Hover the product name to see Cost · Min · Wholesale · Retail. */
export function CmwrPriceTip({
  unit,
  children,
  className,
  hoverOnly = false,
  disabled = false,
}: {
  unit: CmwrPrices | null | undefined;
  children: ReactElement;
  className?: string;
  hoverOnly?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip
      content={unit ? <CmwrTipBody unit={unit} /> : null}
      className={className}
      tipClassName="[padding:4px_8px] [border-radius:6px] [white-space:nowrap]"
      hoverOnly={hoverOnly}
      disabled={disabled || !unit}
      placement="right"
    >
      {children}
    </Tooltip>
  );
}
