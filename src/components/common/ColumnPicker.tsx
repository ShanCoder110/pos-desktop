import { useMemo, useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Checkbox } from "@/components/common/Checkbox";
import { Popover } from "@/components/common/Popover";
import { SearchInput } from "@/components/common/SearchInput";

export type ColumnOption = { id: string; label: string; locked?: boolean };

export function ColumnPicker({
  columns,
  value,
  onChange,
}: {
  columns: ColumnOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState(value);
  const shown = useMemo(
    () => columns.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())),
    [columns, q],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(value);
          setQ("");
        }
      }}
      trigger={
        <Button
          size="icon"
          className={open ? "is-on" : undefined}
          aria-label="Columns"
          onClick={() => setOpen((v) => !v)}
        >
          <Columns3 size={15} />
        </Button>
      }
    >
      <SearchInput value={q} onChange={setQ} placeholder="Search..." />
      <div className="ui-pop-list" style={{ marginTop: 8 }}>
        {shown.map((col) => {
          const on = draft.includes(col.id) || col.locked;
          return (
            <label key={col.id} className={on ? "ui-pop-item is-on" : "ui-pop-item"}>
              <Checkbox
                checked={on}
                disabled={col.locked}
                onChange={(e) => {
                  if (col.locked) return;
                  setDraft((prev) =>
                    e.target.checked ? [...prev, col.id] : prev.filter((id) => id !== col.id),
                  );
                }}
              />
              {col.label}
            </label>
          );
        })}
      </div>
      <div className="ui-pop-foot">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDraft(columns.map((c) => c.id))}
        >
          Reset
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            onChange(draft);
            setOpen(false);
          }}
        >
          Apply
        </Button>
      </div>
    </Popover>
  );
}
