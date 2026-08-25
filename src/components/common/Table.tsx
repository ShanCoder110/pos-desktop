import type { ReactNode } from "react";
import { cn } from "@/utils/format";

export function Table({
  toolbar,
  children,
  footer,
}: {
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="ui-table-card">
      {toolbar ? <div className="ui-table-toolbar">{toolbar}</div> : null}
      <div className="ui-table-wrap">
        <table className="ui-table">{children}</table>
      </div>
      {footer}
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function Th({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <th className={className}>{children}</th>;
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
      {children === null || children === undefined || children === "" ? <span className="ui-empty">—</span> : children}
    </td>
  );
}
