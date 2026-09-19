import { useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Checkbox } from "@/components/common/Checkbox";
import { Popover } from "@/components/common/Popover";

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
  const [draft, setDraft] = useState(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
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
      <div className="ui-pop-list [display:grid] [max-height:240px] [overflow:auto]">
        {columns.map((col) => {
          const on = draft.includes(col.id) || col.locked;
          return (
            <label key={col.id} className={on ? "ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer] is-on" : "ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"}>
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
      <div className="ui-pop-foot [display:flex] [justify-content:flex-end] [gap:8px] [padding-top:8px] [margin-top:8px] [border-top:1px_solid_var(--line)]">
        <Button variant="ghost" size="sm" onClick={() => setDraft(columns.map((c) => c.id))}>
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
