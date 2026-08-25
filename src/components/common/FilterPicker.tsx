import { useState } from "react";
import { ArrowLeft, Funnel, X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Popover } from "@/components/common/Popover";
import { TextInput } from "@/components/common/fields";

export type FilterChip = { field: string; label: string; value: string };

export function FilterChips({
  items,
  onRemove,
}: {
  items: FilterChip[];
  onRemove: (field: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="ui-chip-row">
      {items.map((item) => (
        <span key={item.field} className="ui-chip">
          {item.label}: {item.value}
          <button type="button" onClick={() => onRemove(item.field)} aria-label={`Clear ${item.label}`}>
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

export function FilterPicker({
  fields,
  chips,
  onApply,
}: {
  fields: { id: string; label: string; options?: string[] }[];
  chips: FilterChip[];
  onApply: (chip: FilterChip) => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const current = fields.find((f) => f.id === field);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setField(null);
          setValue("");
        }
      }}
      trigger={
        <Button
          size="icon"
          className={open || chips.length ? "is-on" : undefined}
          aria-label="Filters"
          onClick={() => setOpen((v) => !v)}
        >
          <Funnel size={15} />
          {chips.length ? <span className="ui-count">{chips.length}</span> : null}
        </Button>
      }
    >
      {current ? (
        <>
          <div className="ui-pop-head">
            <button
              type="button"
              onClick={() => {
                setField(null);
                setValue("");
              }}
              aria-label="Back"
            >
              <ArrowLeft size={14} />
            </button>
            {current.label}
          </div>
          {current.options ? (
            <div className="ui-pop-list">
              {current.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={value === opt ? "ui-pop-item is-on" : "ui-pop-item"}
                  onClick={() => setValue(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <TextInput
              autoFocus
              className="is-lg"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={current.label}
            />
          )}
          <div className="ui-pop-foot">
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                if (!value.trim()) return;
                onApply({ field: current.id, label: current.label, value: value.trim() });
                setOpen(false);
                setField(null);
                setValue("");
              }}
            >
              Done
            </Button>
          </div>
        </>
      ) : (
        <div className="ui-pop-list">
          {fields.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ui-pop-item"
              onClick={() => {
                setField(item.id);
                setValue(chips.find((c) => c.field === item.id)?.value ?? "");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
