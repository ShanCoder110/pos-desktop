import { SearchableSelect } from "@/components/common/SearchableSelect";
import { TextInput } from "@/components/common/fields";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { cn } from "@/utils/format";

export type UnitQuantityOption = { value: string; label: string };

/** Reusable quantity + unit entry. The caller decides whether the chosen unit is stock, sale, or transfer. */
export function UnitQuantityEntry({
  quantity,
  unit,
  units,
  onQuantityChange,
  onUnitChange,
  onCreateUnit,
  quantityPlaceholder = "0",
  unitPlaceholder = "Choose unit",
  disabled = false,
  className,
  autoFocusQuantity = false,
}: {
  quantity: string;
  unit: string;
  units: UnitQuantityOption[];
  onQuantityChange: (quantity: string) => void;
  onUnitChange: (unit: string) => void;
  onCreateUnit?: (label: string) => void;
  quantityPlaceholder?: string;
  unitPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocusQuantity?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_minmax(140px,0.72fr)] gap-2", className)}>
      <TextInput
        autoFocus={autoFocusQuantity}
        inputMode="decimal"
        maxLength={FIELD_LIMITS.qty}
        placeholder={quantityPlaceholder}
        value={quantity}
        disabled={disabled}
        aria-label="Quantity"
        onChange={(event) => onQuantityChange(event.target.value)}
      />
      <SearchableSelect
        name="quantity-unit"
        value={unit}
        onChange={onUnitChange}
        options={units}
        placeholder={unitPlaceholder}
        searchPlaceholder="Search units"
        clearable={false}
        disabled={disabled}
        onCreate={onCreateUnit}
        createLabel="Add unit"
      />
    </div>
  );
}
