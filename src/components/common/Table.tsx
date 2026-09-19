import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function Table({
  toolbar,
  note,
  children,
  footer,
  body,
}: {
  toolbar?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  body?: ReactNode;
}) {
  return (
    <div className="ui-table-card [flex:1] [min-height:0] [display:flex] [flex-direction:column] [background:var(--paper)] [border:1px_solid_var(--line)] [border-radius:10px] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)] [overflow:visible] [width:100%]">
      {toolbar ? (
        <div className="ui-table-toolbar [display:flex] [flex-direction:column] [gap:8px] [padding:10px_12px] [border-bottom:1px_solid_var(--line)] [flex-shrink:0]">
          {toolbar}
        </div>
      ) : null}
      {note ? <div className="ui-table-note">{note}</div> : null}
      {body ?? (
        <div className="ui-table-wrap [flex:1] [min-height:0] [overflow:auto] [scrollbar-width:none]">
          <table className="ui-table [width:100%] [border-collapse:collapse]">{children}</table>
        </div>
      )}
      {body ? null : footer}
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function Th({
  children,
  className,
  hint,
}: {
  children?: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <th className={className} title={hint}>
      <span className="ui-th-label">{children}</span>
      {hint ? <small className="ui-th-hint">{hint}</small> : null}
    </th>
  );
}

export function Td({
  children,
  className,
  numeric,
}: {
  children?: ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td className={cn(numeric && "num", className)}>
      {children === null || children === undefined || children === "" ? (
        <span className="ui-empty [color:var(--muted)]">—</span>
      ) : (
        children
      )}
    </td>
  );
}
