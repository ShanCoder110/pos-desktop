/** Preview saves unfinished work; printing prepares a final invoice first. */
export async function preparePosReceipt<T>(flow: {
  hasItems: boolean;
  editing: boolean;
  printNow: boolean;
  saveDraft: () => Promise<boolean>;
  previewDraft: () => void;
  saveInvoice: () => Promise<T | null>;
  showReceipt: (receipt: T) => void;
  lastReceipt: T | null;
  nothingToPrint: () => void;
}) {
  if (flow.hasItems) {
    if (!flow.printNow && !flow.editing) {
      if (await flow.saveDraft()) flow.previewDraft();
      return;
    }
    const receipt = await flow.saveInvoice();
    if (receipt) flow.showReceipt(receipt);
  } else if (flow.lastReceipt) flow.showReceipt(flow.lastReceipt);
  else flow.nothingToPrint();
}

/** Closing/cancelling a browser print dialog is not proof that anything printed. */
export function confirmBrowserPrint(onPrinted: (() => void) | undefined, confirm: () => boolean) {
  if (onPrinted && confirm()) onPrinted();
}

export function finishPosPrint(clearAfterPrint: boolean, clearInvoice: () => void) {
  if (clearAfterPrint) clearInvoice();
}

/** Complete is save-only. Failed validation/saves must leave the bill intact. */
export async function completePosInvoice<T>(
  saveInvoice: () => Promise<T | null>,
  clearInvoice: () => void,
) {
  const invoice = await saveInvoice();
  if (invoice) clearInvoice();
}
