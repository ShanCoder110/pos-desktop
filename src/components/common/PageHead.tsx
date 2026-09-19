import type { ReactNode } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { EMPTY_COPY } from "@/shared/constants/empty";

export function PageHead({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="ui-page-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [width:100%] [flex-shrink:0]">
      <div className="ui-page-heading">
        {icon ? <span className="ui-page-heading-icon">{icon}</span> : null}
        <div>
          <h1 className="ui-page-title [font-size:22px] [font-weight:800] [letter-spacing:-0.03em] [color:var(--ink)] [min-width:0]">
            {title}
          </h1>
          {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {children ? (
        <div className="ui-actions [display:flex] [align-items:center] [gap:8px]">{children}</div>
      ) : null}
    </div>
  );
}

export function EmptyRow({
  cols,
  text = EMPTY_COPY.title,
  description,
  icon,
  children,
}: {
  cols: number;
  text?: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <tr>
      <td className="ui-empty-row" colSpan={cols}>
        <EmptyState icon={icon} title={text} description={description}>
          {children}
        </EmptyState>
      </td>
    </tr>
  );
}
