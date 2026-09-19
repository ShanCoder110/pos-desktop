/** Stable API error codes mirrored from Rust `CODE_*` constants. */
export const API_ERROR_CODES = {
  validation: "VALIDATION_ERROR",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  database: "DATABASE_ERROR",
  internal: "INTERNAL_ERROR",
  supplierPhoneDuplicate: "SUPPLIER_PHONE_DUPLICATE",
  customerPhoneDuplicate: "CUSTOMER_PHONE_DUPLICATE",
  userPhoneDuplicate: "USER_PHONE_DUPLICATE",
  userEmailDuplicate: "USER_EMAIL_DUPLICATE",
  usernameDuplicate: "USERNAME_DUPLICATE",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES] | string;

/** Optional UI overrides for machine codes (prefer these over raw Rust messages). */
export const API_ERROR_COPY: Partial<Record<string, string>> = {
  [API_ERROR_CODES.supplierPhoneDuplicate]: "This phone is already used by another supplier.",
  [API_ERROR_CODES.customerPhoneDuplicate]: "This phone is already used by another customer.",
  [API_ERROR_CODES.userPhoneDuplicate]: "This phone is already used by another user.",
  [API_ERROR_CODES.userEmailDuplicate]: "This email is already used by another user.",
  [API_ERROR_CODES.usernameDuplicate]: "This username is already used.",
  [API_ERROR_CODES.unauthorized]: "Session expired. Sign in again.",
  [API_ERROR_CODES.forbidden]: "You do not have permission for that.",
  [API_ERROR_CODES.notFound]: "That record was not found.",
};
