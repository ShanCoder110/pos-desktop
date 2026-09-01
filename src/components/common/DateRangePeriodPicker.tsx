import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Popover } from "@/components/common/Popover";
import { TextInput } from "@/components/common/fields";
import { cn } from "@/utils/format";
import { DATE_PERIOD_PRESETS } from "@/shared/constants/charts";

export type DatePeriod = "all" | "today" | "7d" | "30d" | "custom";
export type DateRangeFilter = { period: DatePeriod; from: string; to: string };

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function rangeForPeriod(period: DatePeriod, now = new Date()): DateRangeFilter {
  const to = localDate(now);
  if (period === "all") return { period, from: "", to: "" };
  const fromDate = new Date(now);
  if (period === "7d") fromDate.setDate(fromDate.getDate() - 6);
  if (period === "30d") fromDate.setDate(fromDate.getDate() - 29);
  return { period, from: localDate(fromDate), to };
}

export function dateInRange(value: string | null | undefined, range: DateRangeFilter) {
  if (range.period === "all") return true;
  if (!value) return false;
  const date = value.slice(0, 10);
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function prettyDate(value: string) {
  if (!value) return "Date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${value}T00:00:00`),
  );
}

export function DateRangePeriodPicker({
  value,
  onChange,
}: {
  value: DateRangeFilter;
  onChange: (range: DateRangeFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const label = useMemo(() => {
    if (value.period === "custom") return `${prettyDate(value.from)} – ${prettyDate(value.to || value.from)}`;
    return DATE_PERIOD_PRESETS.find((preset) => preset.id === value.period)?.label ?? "All time";
  }, [value]);

  function openPicker() {
    setDraft(value);
    setOpen((shown) => !shown);
  }

  function selectPeriod(period: DatePeriod) {
    if (period === "custom") {
      const fallback = rangeForPeriod("30d");
      setDraft({ period, from: draft.from || fallback.from, to: draft.to || fallback.to });
      return;
    }
    setDraft(rangeForPeriod(period));
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      panelClassName="ui-date-range-panel"
      trigger={
        <Button className="h-8 min-h-8 gap-1.5 rounded-lg px-3" onClick={openPicker} aria-label="Filter by date">
          <CalendarDays size={14} className="text-muted" />
          <span>{label}</span>
          <ChevronDown size={13} className="text-muted" />
        </Button>
      }
    >
      <div className="ui-date-range-layout">
        <aside className="ui-date-range-presets">
          {DATE_PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(draft.period === preset.id && "is-on")}
              onClick={() => selectPeriod(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </aside>
        <div className="ui-date-range-main">
          <div className="ui-date-range-head">
            <strong>Date range</strong>
            <span>Applied to the table and graphs</span>
          </div>
          {draft.period === "all" ? (
            <div className="ui-date-range-empty">Showing records from all dates</div>
          ) : (
            <div className="ui-date-range-fields">
              <label className="field">
                <span className="field-label">From</span>
                <TextInput
                  type="date"
                  value={draft.from}
                  onChange={(event) => setDraft({ ...draft, period: "custom", from: event.target.value })}
                />
              </label>
              <ArrowRight className="ui-date-range-arrow" size={14} aria-hidden />
              <label className="field">
                <span className="field-label">To</span>
                <TextInput
                  type="date"
                  value={draft.to}
                  onChange={(event) => setDraft({ ...draft, period: "custom", to: event.target.value })}
                />
              </label>
            </div>
          )}
          <div className="ui-pop-foot [display:flex] [justify-content:flex-end] [gap:8px] [border-top:1px_solid_var(--line)]">
            <Button size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={draft.period === "custom" && (!draft.from || !draft.to)}
              onClick={() => {
                const normalized =
                  draft.from && draft.to && draft.from > draft.to
                    ? { ...draft, from: draft.to, to: draft.from }
                    : draft;
                onChange(normalized);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Popover>
  );
}
