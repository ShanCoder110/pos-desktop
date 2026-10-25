import type { InvoiceRow } from "@/shared/domain/types";
import type { InvoiceLine } from "@/shared/types";

/** Use the persisted sale prices when printing a completed invoice. */
export function receiptLinesFromInvoice(
  invoice: Pick<InvoiceRow, "items">,
  urduNames: Record<string, string | undefined> = {},
): InvoiceLine[] {
  return invoice.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.productName ?? "",
    urduName: urduNames[item.productId],
    qty: item.quantity,
    unit: item.unitName,
    price: item.unitPrice,
    minFloor: 0,
    lotsNote: "",
    discount: item.discount,
  }));
}
