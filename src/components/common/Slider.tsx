export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="ui-slider [display:grid] [gap:6px]">
      <span className="field-label [font-size:12px] [font-weight:600] [color:var(--sub)]">
        {label} · {value}
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
