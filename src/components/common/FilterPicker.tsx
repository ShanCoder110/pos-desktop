import { useState } from "react";
import { ArrowLeft, Funnel, X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Popover } from "@/components/common/Popover";
import { TextInput } from "@/components/common/fields";

export type FilterChip = { field: string; label: string; value: string };

export function FilterChips({
  items,
  onRemove,
  onClearAll,
}: {
  items: FilterChip[];
  onRemove: (field: string) => void;
  onClearAll?: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="ui-chip-row">
      {items.map((item) => (
        <button key={item.field} type="button" className="ui-chip" onClick={() => onRemove(item.field)}>
          <span className="ui-chip-label">{item.label}:</span>
          <span className="ui-chip-value">{item.value}</span>
          <X size={11} />
        </button>
      ))}
      {items.length >= 2 && onClearAll ? (
        <button type="button" className="ui-chip-clear" onClick={onClearAll}>
          Clear all
        </button>
      ) : null}
    </div>
  );
}

export function FilterPicker({
  fields,
  chips,
  onApply,
}: {
  fields: { id: string; label: string; options?: string[]; searchable?: boolean; placeholder?: string; numeric?: boolean }[];
  chips: FilterChip[];
  onApply: (chip: FilterChip) => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [optQ, setOptQ] = useState("");
  const current = fields.find((f) => f.id === field);
  const options = (current?.options ?? []).filter((opt) =>
    !optQ.trim() ? true : opt.toLowerCase().includes(optQ.trim().toLowerCase()),
  );

  function close() {
    setOpen(false);
    setField(null);
    setValue("");
    setOptQ("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setField(null);
          setValue("");
          setOptQ("");
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
                setOptQ("");
              }}
              aria-label="Back"
            >
              <ArrowLeft size={14} />
            </button>
            {current.label}
          </div>
          {current.options ? (
            <>
              {(current.searchable || current.options.length > 8) && (
                <div className="ui-pop-search">
                  <TextInput
                    autoFocus
                    value={optQ}
                    onChange={(e) => setOptQ(e.target.value)}
                    placeholder={`Search ${current.label.toLowerCase()}…`}
                  />
                </div>
              )}
              <div className="ui-pop-list">
                {options.length === 0 ? (
                  <div className="ui-pop-empty">No matches</div>
                ) : (
                  options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={value === opt ? "ui-pop-item is-on" : "ui-pop-item"}
                      onClick={() => setValue(opt)}
                    >
                      {opt}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="ui-pop-search">
              <TextInput
                autoFocus
                className="is-lg"
                inputMode={current.numeric ? "decimal" : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={current.placeholder ?? current.label}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim()) {
                    onApply({ field: current.id, label: current.label, value: value.trim() });
                    close();
                  }
                }}
              />
            </div>
          )}
          <div className="ui-pop-foot">
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                if (!value.trim()) return;
                onApply({ field: current.id, label: current.label, value: value.trim() });
                close();
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
                setOptQ("");
              }}
            >
              <span>{item.label}</span>
              {chips.some((c) => c.field === item.id) ? <span className="ui-pop-dot" /> : null}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
