export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="ui-tabs">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={value === item.id ? "ui-tab is-on" : "ui-tab"}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
