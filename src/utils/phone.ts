import { PK_MOBILE_LENGTH, PK_MOBILE_PREFIX } from "@/shared/constants/phone";

export function pkMobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length >= 12) digits = `0${digits.slice(2)}`;
  return digits.slice(0, PK_MOBILE_LENGTH);
}

export function formatPkMobile(raw: string): string {
  const digits = pkMobileDigits(raw);
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

export function digitsLeftOfCaret(value: string, caret: number) {
  return (value.slice(0, Math.max(0, caret)).match(/\d/g) ?? []).length;
}

export function caretForDigitCount(formatted: string, digitCount: number) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (formatted[i] >= "0" && formatted[i] <= "9") {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return formatted.length;
}

export function deletePkMobileDigit(value: string, caret: number, direction: "back" | "forward") {
  const digits = pkMobileDigits(value);
  const before = digitsLeftOfCaret(value, caret);
  const index = direction === "back" ? before - 1 : before;
  if (index < 0 || index >= digits.length)
    return {
      formatted: formatPkMobile(digits),
      caret: caretForDigitCount(formatPkMobile(digits), before),
    };
  const next = digits.slice(0, index) + digits.slice(index + 1);
  const formatted = formatPkMobile(next);
  return { formatted, caret: caretForDigitCount(formatted, index) };
}

export function isPkMobile(raw: string): boolean {
  const digits = pkMobileDigits(raw);
  return digits.length === PK_MOBILE_LENGTH && digits.startsWith(PK_MOBILE_PREFIX);
}

export function optionalPkMobile(raw: string, invalid: string) {
  const digits = pkMobileDigits(raw);
  if (!digits) return true;
  if (digits.length >= PK_MOBILE_PREFIX.length && !digits.startsWith(PK_MOBILE_PREFIX))
    return invalid;
  if (digits.length !== PK_MOBILE_LENGTH) return invalid;
  return isPkMobile(digits) || invalid;
}

export function requiredPkMobile(raw: string, required: string, invalid: string) {
  const digits = pkMobileDigits(raw);
  if (!digits) return required;
  if (digits.length >= PK_MOBILE_PREFIX.length && !digits.startsWith(PK_MOBILE_PREFIX))
    return invalid;
  if (digits.length < PK_MOBILE_LENGTH) return invalid;
  return isPkMobile(digits) || invalid;
}
