import type { ReactNode } from "react";

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ui-page-head">
      <h1 className="ui-page-title">{title}</h1>
      {children ? <div className="ui-actions">{children}</div> : null}
    </div>
  );
}

export function EmptyRow({ cols, text = "Nothing here yet" }: { cols: number; text?: string }) {
  return (
    <tr>
      <td className="ui-empty-row" colSpan={cols}>
        {text}
      </td>
    </tr>
  );
}
