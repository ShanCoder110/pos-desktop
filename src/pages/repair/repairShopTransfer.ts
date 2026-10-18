export const REPAIR_TRANSFER_PREFIX = "DUKAN_REPAIR_SHOP:";
export const REPAIR_VOID_PREFIX = "DUKAN_REPAIR_VOID:";

export type RepairTransferLineMeta = {
  productId: string;
  unitId: string;
  unitName: string;
  quantity: number;
  baseQuantity: number;
  unitPrice: number;
  unitCost: number;
};

export type RepairTransferMeta = {
  version: 1;
  lines: RepairTransferLineMeta[];
};

export function encodeRepairTransfer(lines: RepairTransferLineMeta[]) {
  return `${REPAIR_TRANSFER_PREFIX}${JSON.stringify({ version: 1, lines } satisfies RepairTransferMeta)}`;
}

export function decodeRepairTransfer(notes?: string | null): RepairTransferMeta | null {
  if (!notes?.startsWith(REPAIR_TRANSFER_PREFIX)) return null;
  // Optional free-text may follow on later lines (`encode\nuser notes`).
  const jsonPart = notes.slice(REPAIR_TRANSFER_PREFIX.length).split("\n")[0] ?? "";
  try {
    const parsed = JSON.parse(jsonPart) as RepairTransferMeta;
    return parsed.version === 1 && Array.isArray(parsed.lines) ? parsed : null;
  } catch {
    return null;
  }
}

export function encodeRepairVoid(originalTransferId: string) {
  return `${REPAIR_VOID_PREFIX}${originalTransferId}`;
}

export function decodeRepairVoid(notes?: string | null): string | null {
  if (!notes?.startsWith(REPAIR_VOID_PREFIX)) return null;
  const id = notes.slice(REPAIR_VOID_PREFIX.length).split("\n")[0]?.trim() ?? "";
  return id || null;
}

/** Active repair adds only — hides void markers and records that were voided. */
export function isActiveRepairTransfer(
  transfer: { id: string; notes?: string | null },
  allNotes: Array<string | null | undefined>,
) {
  if (decodeRepairVoid(transfer.notes)) return false;
  if (!decodeRepairTransfer(transfer.notes)) return false;
  return !allNotes.some((notes) => decodeRepairVoid(notes) === transfer.id);
}
