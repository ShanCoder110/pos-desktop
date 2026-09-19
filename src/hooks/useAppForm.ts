import { useForm, type FieldValues, type UseFormProps } from "react-hook-form";

/** Shared react-hook-form defaults: validate on submit, show errors under fields. */
export function useAppForm<TFieldValues extends FieldValues>(props?: UseFormProps<TFieldValues>) {
  return useForm<TFieldValues>({
    mode: "onChange",
    reValidateMode: "onChange",
    ...props,
  });
}

export { Controller } from "react-hook-form";
export type { FieldErrors, SubmitHandler } from "react-hook-form";
