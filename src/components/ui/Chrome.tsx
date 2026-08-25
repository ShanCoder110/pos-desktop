import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/format";

export function PageHeader({
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  if (!hint && !actions) return null;
  return (
    <div className="mgmt-page-toolbar">
      {hint ? <p className="mgmt-page-hint">{hint}</p> : <span />}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "teal" | "rose" | "amber" | "emerald";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    teal: "bg-teal-50 text-teal-800",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-800",
  };
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function BalanceBadge({ n }: { n: number }) {
  if (n < 0) return <Badge tone="rose">Owes Rs {Math.abs(n).toLocaleString("en-PK")}</Badge>;
  if (n > 0) return <Badge tone="emerald">Advance Rs {n.toLocaleString("en-PK")}</Badge>;
  return <Badge>Settled</Badge>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint ? <p className="mt-1 text-[12px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rose" | "emerald" | "amber";
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-[18px] font-semibold tabular-nums",
          tone === "rose" && "text-rose-700",
          tone === "emerald" && "text-emerald-700",
          tone === "amber" && "text-amber-700",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
        <Pencil size={14} />
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete">
        <Trash2 size={14} className="text-rose-600" />
      </Button>
    </div>
  );
}

export function DateFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[12px]"
      />
      <span className="text-slate-400">–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[12px]"
      />
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  autoFocus,
  onKeyDown,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={cn(
        "h-8 w-52 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20",
        className,
      )}
    />
  );
}
