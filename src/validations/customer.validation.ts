import { optionalPkMobile, required } from "@/validations/primitives";

export function validateCustomerName(value: string | undefined) {
  return required(value, "Enter the customer name");
}

export function validateCustomerPhone(value: string | undefined) {
  return optionalPkMobile(value);
}

export { validateAdjustBalanceNotes } from "@/validations/supplier.validation";
