import type { FieldErrors, FieldValues, Path, UseFormSetError } from "react-hook-form";

export function fieldMessage<T extends FieldValues>(errors: FieldErrors<T>, name: Path<T>) {
  const error = errors[name];
  return typeof error?.message === "string" ? error.message : undefined;
}

export function requiredTrim(message: string) {
  return (value: string) => Boolean(value?.trim()) || message;
}

export function assignApiError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  message: string,
  fallback: Path<T>,
) {
  const key = /phone/i.test(message) ? ("phone" as Path<T>) : fallback;
  setError(key, { type: "server", message });
}
