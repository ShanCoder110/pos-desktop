import { SUPPLIER_COPY } from "@/shared/constants/suppliers";
import { moneyAmount, notesRequired, optionalPkMobile, required } from "@/validations/primitives";

export function validateSupplierName(value: string | undefined) {
  return required(value, SUPPLIER_COPY.nameRequired);
}

export function validateSupplierPhone(value: string | undefined) {
  return optionalPkMobile(value);
}

export function validateSupplierOpeningAmount(value: string | undefined) {
  if (!value?.trim()) return true;
  return moneyAmount(value, SUPPLIER_COPY.openingAmount);
}

export function validateAdjustBalanceNotes(value: string | undefined) {
  return notesRequired(value, "Enter a reason for the adjustment");
}
