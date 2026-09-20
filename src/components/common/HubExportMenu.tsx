import { useState } from "react";
import { ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { Button, Popover } from "@/components/common";
import { PRODUCT_COPY } from "@/shared/constants/products";
import { exportTableCsv, exportTableExcel, type TableExportColumn } from "@/utils/exportFile";

export function HubExportMenu<T>({
  columns,
  rows,
  filename,
  sheetName,
  disabled,
}: {
  columns: TableExportColumn<T>[];
  rows: T[];
  filename: string;
  sheetName: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const blocked = disabled || rows.length === 0;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button disabled={blocked} onClick={() => setOpen((value) => !value)}>
          {PRODUCT_COPY.exportAction}
          <ChevronDown size={14} />
        </Button>
      }
    >
      <div
        className="ui-pop-list [display:grid] [max-height:240px] [overflow:auto]"
        onClick={() => setOpen(false)}
      >
        <button
          type="button"
          className="ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
          onClick={() => exportTableCsv(columns, rows, `${filename}.csv`)}
        >
          <FileText size={14} />
          CSV
        </button>
        <button
          type="button"
          className="ui-pop-item [display:flex] [align-items:center] [gap:8px] [width:100%] [min-height:32px] [padding:0_8px] [border:0] [border-radius:6px] [background:transparent] [color:var(--ink)] [font-size:12px] [font-weight:550] [text-align:left] [cursor:pointer]"
          onClick={() => exportTableExcel(columns, rows, sheetName, `${filename}.xls`)}
        >
          <FileSpreadsheet size={14} />
          Excel
        </button>
      </div>
    </Popover>
  );
}
