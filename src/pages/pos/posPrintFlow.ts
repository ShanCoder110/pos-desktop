/** Preview saves unfinished work. Only a print request prepares a final invoice. */
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
