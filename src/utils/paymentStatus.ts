import type { PaymentStatus } from "@/shared/domain/types";

/** Badge tone for invoice payment_status across invoices, credit, dashboard. */
export function paymentStatusTone(status: PaymentStatus | string) {
  switch (status) {
    case "PAID":
      return "ok" as const;
    case "PARTIAL":
      return "warn" as const;
    case "RETURNED":
    case "PARTIALLY_RETURNED":
      return "info" as const;
    case "CREDIT":
    case "UNPAID":
      return "danger" as const;
    default:
      return "info" as const;
  }
}
