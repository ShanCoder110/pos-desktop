import { FORM_COPY } from "@/shared/constants/fields";
import { optionalPkMobile, required } from "@/validations/primitives";

export function validateUserName(value: string | undefined) {
  return required(value, FORM_COPY.nameRequired);
}

export function validateUsername(value: string | undefined) {
  return required(value, FORM_COPY.usernameRequired);
}

export function validateUserPhone(value: string | undefined) {
  const digits = value?.trim();
  if (!digits) return "Enter a phone number";
  return optionalPkMobile(value);
}

export function validateUserEmail(value: string | undefined) {
  const email = value?.trim();
  if (!email) return "Enter an email";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email";
  return true;
}
