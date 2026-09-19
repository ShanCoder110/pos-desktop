import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type Ref,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Eye, EyeOff, Phone } from "lucide-react";
import { SearchableSelect, type SelectOption } from "@/components/common/SearchableSelect";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { PK_MOBILE_COPY, PK_MOBILE_PLACEHOLDER } from "@/shared/constants/phone";
import { cn, limitMoneyDraft, moneyNum } from "@/utils/format";
import {
  caretForDigitCount,
  deletePkMobileDigit,
  digitsLeftOfCaret,
  formatPkMobile,
} from "@/utils/phone";

const SKIP_MAX_LENGTH = new Set([
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "color",
  "range",
  "file",
  "checkbox",
  "radio",
  "hidden",
]);

function defaultMaxLength(type: string | undefined, maxLength: number | undefined) {
  if (maxLength != null) return maxLength;
  if (type && SKIP_MAX_LENGTH.has(type)) return undefined;
  if (type === "password") return FIELD_LIMITS.password;
  if (type === "email") return FIELD_LIMITS.email;
  return FIELD_LIMITS.text;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("field [display:grid] [gap:6px]", error && "is-invalid", className)}>
      <span className="field-label [font-size:12px] [font-weight:600] [color:var(--sub)]">
        {label}
      </span>
      {children}
      {error ? (
        <span className="field-error [font-size:11px] [color:var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="field-hint [font-size:11px] [color:var(--muted)]">{hint}</span>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  startIcon,
  endIcon,
  inputRef,
  type,
  maxLength,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}) {
  // Never hand-roll password inputs — always go through PasswordInput (eye toggle).
  if (type === "password") {
    return (
      <PasswordInput
        className={className}
        startIcon={startIcon}
        inputRef={inputRef}
        maxLength={maxLength}
        {...props}
      />
    );
  }

  const length = defaultMaxLength(type, maxLength);
  if (!startIcon && !endIcon) {
    return (
      <input
        ref={inputRef}
        type={type}
        maxLength={length}
        className={cn(
          "field-input [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <div
      className={cn(
        "field-wrap [position:relative] [display:flex] [align-items:center]",
        startIcon ? "has-start" : undefined,
        endIcon ? "has-end" : undefined,
      )}
    >
      {startIcon ? (
        <span className="field-icon [position:absolute] [top:50%] [display:grid] [place-items:center] [color:var(--muted)] [transform:translateY(-50%)] [pointer-events:none] is-start">
          {startIcon}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type={type}
        maxLength={length}
        className={cn(
          "field-input [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]",
          className,
        )}
        {...props}
      />
      {endIcon ? (
        <span className="field-icon [position:absolute] [top:50%] [display:grid] [place-items:center] [color:var(--muted)] [transform:translateY(-50%)] [pointer-events:none] is-end">
          {endIcon}
        </span>
      ) : null}
    </div>
  );
}

/** Shared password field — always includes show/hide eye toggle. Prefer this over `type="password"`. */
export function PasswordInput({
  className,
  startIcon,
  inputRef,
  maxLength,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "endIcon"> & {
  startIcon?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const length = defaultMaxLength("password", maxLength);

  return (
    <div
      className={cn(
        "field-wrap [position:relative] [display:flex] [align-items:center] has-end",
        startIcon ? "has-start" : undefined,
      )}
    >
      {startIcon ? (
        <span className="field-icon [position:absolute] [top:50%] [display:grid] [place-items:center] [color:var(--muted)] [transform:translateY(-50%)] [pointer-events:none] is-start">
          {startIcon}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type={visible ? "text" : "password"}
        maxLength={length}
        autoComplete={props.autoComplete ?? "current-password"}
        className={cn(
          "field-input [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        className="field-password-toggle field-icon is-end [position:absolute] [top:50%] [display:grid] [place-items:center] [transform:translateY(-50%)] [color:var(--muted)] [border:0] [background:transparent] [padding:0] [cursor:pointer]"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function optionsFromSelectChildren(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (
      !isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)
    )
      return;
    if (child.type === "optgroup") {
      options.push(...optionsFromSelectChildren(child.props.children));
      return;
    }
    if (child.type !== "option" || child.props.disabled) return;
    const label = Children.toArray(child.props.children).join("").trim();
    options.push({
      value: String(child.props.value ?? ""),
      label: label || String(child.props.value ?? ""),
    });
  });
  return options;
}

export function SelectInput({
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  children,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => optionsFromSelectChildren(children), [children]);
  const [uncontrolled, setUncontrolled] = useState(() => String(defaultValue ?? ""));
  const selected = value !== undefined ? String(value) : uncontrolled;

  return (
    <SearchableSelect
      className={cn("field-select", className)}
      options={options}
      value={selected}
      onChange={(next) => {
        if (value === undefined) setUncontrolled(next);
        onChange?.({ target: { value: next, name: name ?? "" } } as ChangeEvent<HTMLSelectElement>);
      }}
      disabled={disabled}
      name={name}
      searchable={false}
      clearable={false}
      placeholder="Select…"
    />
  );
}

export function TextArea({
  className,
  maxLength,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      maxLength={maxLength ?? FIELD_LIMITS.notes}
      className={cn(
        "field-textarea [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s] [height:88px] [padding:10px_12px] [resize:none]",
        className,
      )}
      {...props}
    />
  );
}

export function MoneyInput({
  className,
  value,
  onChange,
  onFocus,
  onBlur,
  maxLength,
  disabled,
  readOnly,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const controlled = value !== undefined;
  const [draft, setDraft] = useState(() => String(value ?? ""));
  const editing = useRef(false);
  const locked = Boolean(disabled || readOnly);

  useEffect(() => {
    if (!editing.current && controlled) setDraft(String(value ?? ""));
  }, [controlled, value]);

  return (
    <div
      className={cn(
        "field-affix [display:flex] [align-items:stretch] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [overflow:hidden] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]",
        locked && "is-locked",
      )}
    >
      <span>Rs</span>
      <input
        className={cn(
          "field-input [width:100%] [height:38px] [min-height:38px] [box-sizing:border-box] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper)] [color:var(--ink)] [padding:0_12px] [font-size:13.5px] [outline:none] [transition:border-color_0.15s,_box-shadow_0.15s,_background_0.15s]",
          className,
        )}
        inputMode="decimal"
        {...props}
        disabled={disabled}
        readOnly={locked}
        tabIndex={locked ? -1 : props.tabIndex}
        maxLength={maxLength ?? FIELD_LIMITS.moneyChars}
        value={controlled ? draft : undefined}
        onFocus={(event) => {
          if (locked) {
            event.currentTarget.blur();
            return;
          }
          editing.current = true;
          onFocus?.(event);
        }}
        onChange={(event) => {
          if (locked) return;
          const next = limitMoneyDraft(event.target.value);
          if (controlled) setDraft(next);
          if (next !== event.target.value) event.target.value = next;
          onChange?.(event);
        }}
        onBlur={(event) => {
          editing.current = false;
          if (controlled) setDraft(String(value ?? event.currentTarget.value));
          onBlur?.(event);
        }}
      />
    </div>
  );
}

export function MoneyDisplay({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("field-affix is-locked", className)} aria-readonly="true">
      <span>Rs</span>
      <span className="field-affix-value">{moneyNum(value)}</span>
    </div>
  );
}

export function PhoneInput({
  value,
  onChange,
  onBlur,
  className,
  disabled,
  name,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || caretRef.current == null) return;
    input.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  }, [value]);

  function commit(formatted: string, caret: number) {
    caretRef.current = caret;
    onChange(formatted);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.setSelectionRange(caret, caret);
    });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    const formatted = formatPkMobile(raw);
    commit(formatted, caretForDigitCount(formatted, digitsLeftOfCaret(raw, caret)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    if (start !== end) return;
    if (event.key === "Backspace" && start > 0 && !/\d/.test(input.value[start - 1] ?? "")) {
      event.preventDefault();
      const next = deletePkMobileDigit(input.value, start, "back");
      commit(next.formatted, next.caret);
      return;
    }
    if (
      event.key === "Delete" &&
      start < input.value.length &&
      !/\d/.test(input.value[start] ?? "")
    ) {
      event.preventDefault();
      const next = deletePkMobileDigit(input.value, start, "forward");
      commit(next.formatted, next.caret);
    }
  }

  return (
    <TextInput
      id={id}
      name={name}
      disabled={disabled}
      className={className}
      startIcon={<Phone size={15} />}
      inputRef={inputRef}
      inputMode="numeric"
      autoComplete="tel"
      placeholder={PK_MOBILE_PLACEHOLDER}
      value={value ?? ""}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
    />
  );
}

export function PhoneField({
  value,
  onChange,
  onBlur,
  error,
  className,
  inputClassName,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}) {
  return (
    <Field label="Phone" hint={PK_MOBILE_COPY.hint} error={error} className={className}>
      <PhoneInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className={inputClassName}
        disabled={disabled}
      />
    </Field>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "toggle [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:4px_0] [border:0] [background:transparent] [text-align:left] [cursor:pointer]",
        checked && "is-on",
      )}
    >
      <span className="toggle-label [font-size:13px] [color:var(--ink)]">{label}</span>
      <span className="toggle-track [position:relative] [width:36px] [height:20px] [border-radius:999px] [background:var(--line)] [transition:background_0.15s_ease]">
        <span className="toggle-thumb [position:absolute] [top:2px] [left:2px] [width:16px] [height:16px] [border-radius:999px] [background:var(--paper)] [transition:transform_0.15s_ease]" />
      </span>
    </button>
  );
}
