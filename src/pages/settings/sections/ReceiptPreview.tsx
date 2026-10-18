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
    urduName: "ایل ای ڈی ٹی وی 32 انچ سام سنگ",
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
    urduName: "سولر پینل 540 واٹ",
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
    urduName: "یو ایس بی سی فاسٹ چارجر",
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
    urduName: "بلوٹوتھ اسپیکر جے بی ایل",
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
  address: "Hall Road, Lahore",
  balance: 2500,
  isWalking: false,
};

export function ReceiptPreview({ settings }: { settings: ShopSettings }) {
  const paper = settings.printerPaperWidth ?? settings.paperWidth;
  const thermal = settings.printSize === "thermal";
  const widthPx = thermal ? thermalWidthPx(paper) : 320;
  const discount = 1700;
  const total = SAMPLE_LINES.reduce((sum, line) => sum + line.qty * line.price, 0) - discount;

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
          discount={discount}
          paid={0}
          balanceBefore={2500}
          balanceAfter={2500 + total}
          invoiceNumber={`${settings.invoicePrefix || "INV"}-0001`}
        />
      </div>
    </div>
  );
}
