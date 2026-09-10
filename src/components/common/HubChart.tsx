import { CHART_COLORS } from "@/shared/constants/charts";

export type HubChartType = "bar" | "line" | "donut";

export type HubChartPoint = {
  id?: string;
  label: string;
  value: number;
  details?: { label: string; value: string }[];
  up?: boolean;
};

function axisLabel(label: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) {
    const date = new Date(`${label.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
  }
  return label;
}

function pointTitle(point: HubChartPoint, formatValue: (value: number) => string) {
  const extra = point.details?.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
  return extra ? `${point.label}\n${formatValue(point.value)}\n${extra}` : `${point.label}: ${formatValue(point.value)}`;
}

function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const beforePrevious = points[index - 2] ?? previous;
    const next = points[index + 1] ?? point;
    const control1X = previous.x + (point.x - beforePrevious.x) / 6;
    const control1Y = previous.y + (point.y - beforePrevious.y) / 6;
    const control2X = point.x - (next.x - previous.x) / 6;
    const control2Y = point.y - (next.y - previous.y) / 6;
    return `${path} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${point.x} ${point.y}`;
  }, "");
}

export function HubChart({
  type,
  title,
  subtitle,
  data,
  formatValue = (value) => new Intl.NumberFormat().format(value),
  controls,
  onPointClick,
  selectedId,
  sidePanel,
  maxItems = 10,
}: {
  type: HubChartType;
  title: string;
  subtitle?: string;
  data: HubChartPoint[];
  formatValue?: (value: number) => string;
  controls?: React.ReactNode;
  onPointClick?: (point: HubChartPoint) => void;
  selectedId?: string;
  sidePanel?: React.ReactNode;
  maxItems?: number | null;
}) {
  const valid = data.filter((point) => Number.isFinite(point.value));
  const shown = type === "bar"
    ? maxItems === null ? valid : valid.slice(0, maxItems)
    : valid.slice(0, 120);
  const max = Math.max(1, ...shown.map((point) => point.value));
  const total = shown.reduce((sum, point) => sum + Math.max(0, point.value), 0);
  const linePoints = shown.map((point, index) => ({
    x: shown.length === 1 ? 455 : 48 + (index / (shown.length - 1)) * 827,
    y: 267 - (point.value / max) * 232,
  }));
  const linePath = smoothPath(linePoints);

  if (!shown.length) {
    return <div className="grid min-h-64 flex-1 place-items-center text-[12px] text-muted">No data matches the current filters.</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
    <div className="flex min-h-full min-w-0 items-stretch">
    <section className="min-w-0 flex-1 p-5">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[14px] font-bold text-ink">{title}</h3>
          <p className="mt-1 text-[10px] text-muted">{subtitle ?? `${shown.length} filtered items`}</p>
        </div>
        {controls}
      </header>

      {type === "bar" ? (
        <div className="grid max-w-5xl gap-3">
          {shown.map((point, index) => (
            <button
              key={point.id ?? point.label}
              type="button"
              className={`group relative grid w-full grid-cols-[150px_minmax(120px,1fr)_100px] items-center gap-3 rounded-lg border-0 p-1 text-left transition-colors ${selectedId === point.id ? "bg-accent-bg/70" : "bg-transparent hover:bg-bg/60"}`}
              onClick={() => onPointClick?.(point)}
            >
              <span className="truncate text-[11px] font-semibold text-sub" title={point.label}>{point.label}</span>
              <div className="h-7 overflow-hidden rounded-md bg-bg">
                <div
                  className="h-full min-w-1 rounded-md transition-[width] duration-300"
                  style={{ width: `${Math.max(1, (point.value / max) * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] }}
                />
              </div>
              <strong className="text-right text-[11px] tabular-nums text-ink">{formatValue(point.value)}</strong>
              {point.details?.length ? (
                <span className="pointer-events-none absolute left-[160px] top-[calc(100%+6px)] z-40 hidden min-w-[250px] rounded-xl border border-line bg-paper p-3 shadow-[0_16px_36px_rgba(15,23,42,0.18)] group-hover:block">
                  <strong className="mb-2 block text-[12px] text-ink">{point.label}</strong>
                  <span className="grid gap-1.5">
                    {point.details.map((detail) => (
                      <span key={detail.label} className="flex items-center justify-between gap-6 text-[10px]">
                        <span className="text-muted">{detail.label}</span>
                        <b className="tabular-nums text-ink">{detail.value}</b>
                      </span>
                    ))}
                  </span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {type === "line" ? (
        <div className="min-w-[620px] max-w-6xl rounded-xl border border-line bg-gradient-to-b from-accent-bg/35 to-paper p-3 shadow-sm">
          <svg viewBox="0 0 900 330" className="h-auto w-full" role="img" aria-label={title}>
            {[0, 1, 2, 3, 4].map((line) => (
              <line key={line} x1="48" x2="875" y1={35 + line * 58} y2={35 + line * 58} stroke="var(--line)" strokeWidth="1" />
            ))}
            {linePoints.length > 1 ? (
              <path
                d={`${linePath} L ${linePoints[linePoints.length - 1]?.x ?? 48} 267 L ${linePoints[0].x} 267 Z`}
                fill="color-mix(in srgb, var(--accent) 12%, transparent)"
                stroke="none"
              />
            ) : null}
            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
            {shown.map((point, index) => {
              const { x, y } = linePoints[index];
              const labelStep = Math.max(1, Math.ceil(shown.length / 7));
              const showLabel = index % labelStep === 0 || index === shown.length - 1;
              const color = point.up ? "var(--danger)" : "var(--accent)";
              return (
                <g
                  key={point.id ?? `${point.label}-${index}`}
                  className={onPointClick ? "cursor-pointer" : undefined}
                  onClick={() => onPointClick?.(point)}
                >
                  <circle cx={x} cy={y} r={selectedId === point.id || showLabel ? "5" : "3"} fill="var(--paper)" stroke={color} strokeWidth={showLabel ? "3" : "2"}>
                    <title>{pointTitle(point, formatValue)}</title>
                  </circle>
                  {showLabel ? <text x={x} y="302" textAnchor="middle" fontSize="10" fill="var(--muted)">{axisLabel(point.label)}</text> : null}
                  {showLabel ? <text x={x} y={Math.max(17, y - 11)} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">{formatValue(point.value)}</text> : null}
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
                return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${end}%`;
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
                <span className="size-2.5 rounded-sm" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="truncate text-sub" title={point.label}>{point.label}</span>
                <strong className="tabular-nums text-ink">{formatValue(point.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
    {sidePanel}
    </div>
    </div>
  );
}
