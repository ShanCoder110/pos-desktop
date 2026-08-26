import type { ReactNode } from "react";

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ui-page-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [width:100%] [flex-shrink:0]">
      <h1 className="ui-page-title [font-size:22px] [font-weight:800] [letter-spacing:-0.03em] [color:var(--ink)] [min-width:0]">{title}</h1>
      {children ? <div className="ui-actions [display:flex] [align-items:center] [gap:8px]">{children}</div> : null}
    </div>
  );
}

export function EmptyRow({ cols, text = "Nothing here yet" }: { cols: number; text?: string }) {
  return (
    <tr>
      <td className="ui-empty-row ![padding:32px_12px] [text-align:center] [color:var(--muted)] [font-size:13px]" colSpan={cols}>
        {text}
      </td>
    </tr>
  );
}
