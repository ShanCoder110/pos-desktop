import { InvoiceThermalReceipt } from "@/components/print/InvoiceThermalReceipt";
import { jameelNooriFontFaceCss } from "@/utils/receiptPrintFonts";
import { RECEIPT_THERMAL_CSS } from "@/utils/receiptThermalStyles";
import { thermalWidthPx } from "@/utils/receiptShare";
import type { Customer, InvoiceLine, ShopSettings } from "@/shared/types";

const SAMPLE_LINES: InvoiceLine[] = [
  {
    id: "1",
    productId: "p1",
    name: 'LED TV 32" Samsung',
    qty: 1,
    unit: "Piece",
    price: 45000,
    minFloor: 0,
    lotsNote: "",
  },
  {
    id: "2",
    productId: "p2",
    name: "Solar Panel 540W",
    qty: 2,
    unit: "Piece",
    price: 18500,
    minFloor: 0,
    lotsNote: "",
  },
  {
    id: "3",
    productId: "p3",
    name: "USB-C Fast Charger",
    qty: 3,
    unit: "Piece",
    price: 850,
    minFloor: 0,
    lotsNote: "",
  },
  {
    id: "4",
    productId: "p4",
    name: "Bluetooth Speaker JBL",
    qty: 1,
    unit: "Piece",
    price: 3200,
    minFloor: 0,
    lotsNote: "",
  },
];

const SAMPLE_CUSTOMER: Customer = {
  id: "preview",
  name: "Ahmed Khan",
  phone: "0300-1234567",
  balance: 2500,
  isWalking: false,
};

export function ReceiptPreview({ settings }: { settings: ShopSettings }) {
  const paper = settings.printerPaperWidth ?? settings.paperWidth;
  const thermal = settings.printSize === "thermal";
  const widthPx = thermal ? thermalWidthPx(paper) : 320;
  const total = SAMPLE_LINES.reduce((sum, line) => sum + line.qty * line.price, 0);

  return (
    <div className="receipt-settings-preview">
      <style>{`${jameelNooriFontFaceCss()}${RECEIPT_THERMAL_CSS}`}</style>
      <p className="receipt-settings-preview-label">Live preview</p>
      <div className="receipt-settings-preview-frame" style={{ width: widthPx }}>
        <InvoiceThermalReceipt
          settings={settings}
          customer={SAMPLE_CUSTOMER}
          lines={SAMPLE_LINES}
          total={total}
          paid={90000}
          balanceBefore={2500}
          balanceAfter={Math.max(0, 2500 - (90000 - total))}
          invoiceNumber={`${settings.invoicePrefix || "INV"}-0001`}
        />
      </div>
    </div>
  );
}
