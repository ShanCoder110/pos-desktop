import { FIELD_LIMITS } from "@/shared/constants/fields";
import { PK_MOBILE_COPY } from "@/shared/constants/phone";
import { pkMobileDigits } from "@/utils/phone";

export type ValidationResult = string | true;

export function required(value: string | undefined, message: string): ValidationResult {
  return value?.trim() ? true : message;
}

export function optionalPkMobile(value: string | undefined): ValidationResult {
  if (!value?.trim()) return true;
  const digits = pkMobileDigits(value);
  if (digits.length !== 11 || !digits.startsWith("03")) {
    return PK_MOBILE_COPY.invalid;
  }
  return true;
}

export function moneyAmount(
  value: string | undefined,
  message = "Enter an amount",
): ValidationResult {
  if (!value?.trim()) return message;
  const amount = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return message;
  return true;
}

export function maxLength(
  value: string | undefined,
  max: number,
  message: string,
): ValidationResult {
  if (!value || value.length <= max) return true;
  return message;
}

export function notesRequired(
  value: string | undefined,
  message = "Enter a reason",
): ValidationResult {
  return required(value, message);
}

export const LIMITS = FIELD_LIMITS;
