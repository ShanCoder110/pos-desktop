import type { HubView } from "@/pages/products/HubToolbar";

export type HubChartPoint = { id?: string; label: string; value: number };

const COLORS = ["#0f9f8f", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#64748b"];

export function HubChart({
  type,
  title,
  subtitle,
  data,
  formatValue = (value) => new Intl.NumberFormat().format(value),
}: {
  type: Exclude<HubView, "table">;
  title: string;
  subtitle?: string;
  data: HubChartPoint[];
  formatValue?: (value: number) => string;
}) {
  const shown = data.filter((point) => Number.isFinite(point.value)).slice(0, 12);
  const max = Math.max(1, ...shown.map((point) => point.value));
  const total = shown.reduce((sum, point) => sum + Math.max(0, point.value), 0);

  if (!shown.length) {
    return <div className="grid min-h-64 flex-1 place-items-center text-[12px] text-muted">No data matches the current filters.</div>;
  }

  return (
    <section className="min-h-0 flex-1 overflow-auto p-5">
      <header className="mb-5">
        <h3 className="m-0 text-[14px] font-bold text-ink">{title}</h3>
        <p className="mt-1 text-[10px] text-muted">{subtitle ?? `${shown.length} filtered items`}</p>
      </header>

      {type === "bar" ? (
        <div className="grid max-w-5xl gap-3">
          {shown.map((point, index) => (
            <div key={point.id ?? point.label} className="grid grid-cols-[150px_minmax(120px,1fr)_100px] items-center gap-3">
              <span className="truncate text-[11px] font-semibold text-sub" title={point.label}>{point.label}</span>
              <div className="h-7 overflow-hidden rounded-md bg-bg">
                <div
                  className="h-full min-w-1 rounded-md transition-[width] duration-300"
                  style={{ width: `${Math.max(1, (point.value / max) * 100)}%`, background: COLORS[index % COLORS.length] }}
                />
              </div>
              <strong className="text-right text-[11px] tabular-nums text-ink">{formatValue(point.value)}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {type === "line" ? (
        <div className="min-w-[620px] max-w-6xl rounded-xl border border-line bg-bg/40 p-3">
          <svg viewBox="0 0 900 330" className="h-auto w-full" role="img" aria-label={title}>
            {[0, 1, 2, 3, 4].map((line) => (
              <line key={line} x1="48" x2="875" y1={35 + line * 58} y2={35 + line * 58} stroke="var(--line)" strokeWidth="1" />
            ))}
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth="4"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={shown.map((point, index) => {
                const x = shown.length === 1 ? 455 : 48 + (index / (shown.length - 1)) * 827;
                const y = 267 - (point.value / max) * 232;
                return `${x},${y}`;
              }).join(" ")}
            />
            {shown.map((point, index) => {
              const x = shown.length === 1 ? 455 : 48 + (index / (shown.length - 1)) * 827;
              const y = 267 - (point.value / max) * 232;
              return (
                <g key={point.id ?? point.label}>
                  <circle cx={x} cy={y} r="5" fill="var(--paper)" stroke="var(--accent)" strokeWidth="3" />
                  <text x={x} y="302" textAnchor="middle" fontSize="10" fill="var(--muted)">{point.label.slice(0, 13)}</text>
                  <text x={x} y={Math.max(17, y - 11)} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">{formatValue(point.value)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : null}

      {type === "donut" ? (
        <div className="grid max-w-4xl grid-cols-[260px_1fr] items-center gap-8">
          <div
            className="relative aspect-square rounded-full"
            style={{
              background: `conic-gradient(${shown.map((point, index) => {
                const before = shown.slice(0, index).reduce((sum, item) => sum + Math.max(0, item.value), 0);
                const start = total ? (before / total) * 100 : 0;
                const end = total ? ((before + Math.max(0, point.value)) / total) * 100 : start;
                return `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
              }).join(",")})`,
            }}
          >
            <div className="absolute inset-[27%] grid place-items-center rounded-full bg-paper text-center">
              <span className="text-[10px] text-muted">Total</span>
              <strong className="text-[15px] text-ink">{formatValue(total)}</strong>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {shown.map((point, index) => (
              <div key={point.id ?? point.label} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[11px]">
                <span className="size-2.5 rounded-sm" style={{ background: COLORS[index % COLORS.length] }} />
                <span className="truncate text-sub" title={point.label}>{point.label}</span>
                <strong className="tabular-nums text-ink">{formatValue(point.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
