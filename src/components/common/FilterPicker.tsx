import { useState } from "react";
import { ArrowLeft, Funnel, X } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Popover } from "@/components/common/Popover";
import { TextInput } from "@/components/common/fields";
import { FIELD_LIMITS } from "@/shared/constants/fields";

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
    <div className="ui-chip-row [display:flex] [flex-wrap:wrap] [gap:6px]">
      {items.map((item) => (
        <button
          key={item.field}
          type="button"
          className="ui-chip [display:inline-flex] [align-items:center] [gap:6px] [height:26px] [padding:0_8px_0_10px] [border:1px_solid_color-mix(in_srgb,_var(--accent)_28%,_transparent)] [border-radius:999px] [background:var(--accent-bg)] [color:var(--accent-deep)] [font-size:11px] [font-weight:650] [cursor:pointer]"
          onClick={() => onRemove(item.field)}
        >
          <span className="ui-chip-label [opacity:0.75]">{item.label}:</span>
          <span className="ui-chip-value [max-width:140px] [overflow:hidden] [text-overflow:ellipsis] [white-space:nowrap]">
            {item.value}
          </span>
          <X size={11} />
        </button>
      ))}
      {items.length >= 2 && onClearAll ? (
        <button
          type="button"
          className="ui-chip-clear [border:0] [background:transparent] [color:var(--danger)] [font-size:11px] [font-weight:700] [cursor:pointer] [text-decoration:underline] [text-underline-offset:2px]"
          onClick={onClearAll}
        >
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
  fields: {
    id: string;
    label: string;
    options?: string[];
    searchable?: boolean;
    placeholder?: string;
    numeric?: boolean;
  }[];
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
          <div className="ui-pop-head [display:flex] [align-items:center] [gap:8px] [padding:4px_4px_8px] [margin-bottom:6px] [border-bottom:1px_solid_var(--line)] [font-size:13px] [font-weight:700] [color:var(--ink)]">
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
                <div className="ui-pop-search [padding:4px_4px_8px]">
                  <TextInput
                    autoFocus
                    maxLength={FIELD_LIMITS.search}
                    value={optQ}
                    onChange={(e) => setOptQ(e.target.value)}
                    placeholder={`Search ${current.label.toLowerCase()}…`}
                  />
                </div>
              )}
              <div className="ui-pop-list [display:grid] [max-height:240px] [overflow:auto]">
                {options.length === 0 ? (
                  <div className="ui-pop-empty [padding:16px_10px] [text-align:center] [font-size:12px] [color:var(--muted)]">
                    No matches
                  </div>
                ) : (
                  options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={
                        value === opt
                          ? "ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer] is-on"
                          : "ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
                      }
                      onClick={() => setValue(opt)}
                    >
                      {opt}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="ui-pop-search [padding:4px_4px_8px]">
              <TextInput
                autoFocus
                className="is-lg"
                maxLength={current.numeric ? FIELD_LIMITS.qty : FIELD_LIMITS.search}
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
          <div className="ui-pop-foot [display:flex] [justify-content:flex-end] [gap:8px] [padding-top:8px] [margin-top:8px] [border-top:1px_solid_var(--line)]">
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
        <div className="ui-pop-list [display:grid] [max-height:240px] [overflow:auto]">
          {fields.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
              onClick={() => {
                setField(item.id);
                setValue(chips.find((c) => c.field === item.id)?.value ?? "");
                setOptQ("");
              }}
            >
              <span>{item.label}</span>
              {chips.some((c) => c.field === item.id) ? (
                <span className="ui-pop-dot [width:6px] [height:6px] [margin-left:auto] [border-radius:99px] [background:var(--accent)]" />
              ) : null}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
