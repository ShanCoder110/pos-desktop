import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Popover } from "@/components/common/Popover";
import { TextInput } from "@/components/common/fields";
import { cn } from "@/utils/format";

export type DatePeriod = "all" | "today" | "7d" | "30d" | "custom";
export type DateRangeFilter = { period: DatePeriod; from: string; to: string };

const PRESETS: { id: DatePeriod; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom range" },
];

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
    return PRESETS.find((preset) => preset.id === value.period)?.label ?? "All time";
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
      panelClassName="!w-[430px] !p-0"
      trigger={
        <Button className="gap-1.5" onClick={openPicker} aria-label="Filter by date">
          <CalendarDays size={14} className="text-muted" />
          <span>{label}</span>
          <ChevronDown size={13} className="text-muted" />
        </Button>
      }
    >
      <div className="grid grid-cols-[130px_1fr]">
        <aside className="border-r border-line p-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                "min-h-8 w-full rounded-md border-0 bg-transparent px-2.5 text-left text-[11px] text-sub hover:bg-bg",
                draft.period === preset.id && "bg-accent-bg font-bold text-accent-deep",
              )}
              onClick={() => selectPeriod(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </aside>
        <div className="grid content-start gap-3 p-3">
          <div>
            <strong className="block text-[12px] text-ink">Date range</strong>
            <span className="text-[10px] text-muted">Applied to the table and graphs</span>
          </div>
          {draft.period === "all" ? (
            <div className="grid min-h-24 place-items-center rounded-lg bg-bg text-[11px] text-muted">
              Showing records from all dates
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_16px_1fr] items-end gap-2">
              <label className="grid gap-1 text-[10px] font-bold text-muted">
                From
                <TextInput
                  type="date"
                  value={draft.from}
                  onChange={(event) => setDraft({ ...draft, period: "custom", from: event.target.value })}
                />
              </label>
              <ArrowRight className="mb-3 text-muted" size={14} />
              <label className="grid gap-1 text-[10px] font-bold text-muted">
                To
                <TextInput
                  type="date"
                  value={draft.to}
                  onChange={(event) => setDraft({ ...draft, period: "custom", to: event.target.value })}
                />
              </label>
            </div>
          )}
          <div className="mt-1 flex justify-end gap-2 border-t border-line pt-3">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={draft.period === "custom" && (!draft.from || !draft.to)}
              onClick={() => {
                const normalized = draft.from && draft.to && draft.from > draft.to
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
