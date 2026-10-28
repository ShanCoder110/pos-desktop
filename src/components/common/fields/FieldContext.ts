import { createContext, useContext, useId } from "react";

export const FieldContext = createContext<{
  id: string;
  labelId: string;
  descriptionId?: string;
  invalid?: boolean;
  required?: boolean;
} | null>(null);

/** Shared by native fields and custom comboboxes, including through portals. */
export function useFieldControl(explicitLabel?: string) {
  const field = useContext(FieldContext);
  const controlId = useId();
  return field
    ? {
        id: `${field.id}-${controlId}`,
        "aria-labelledby": explicitLabel ? undefined : field.labelId,
        "aria-describedby": field.descriptionId,
        "aria-invalid": field.invalid || undefined,
        "aria-required": field.required || undefined,
      }
    : {};
}
