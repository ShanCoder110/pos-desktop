import { cn } from "@/utils/format";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("ui-skeleton", className)} style={style} />;
}

export function TableRowsSkeleton({
  columnCount,
  rows = 8,
  selectable = false,
  hasActions = false,
}: {
  columnCount: number;
  rows?: number;
  selectable?: boolean;
  hasActions?: boolean;
}) {
  const widths = ["72%", "58%", "64%", "46%", "54%", "40%"];
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="is-skeleton">
          {selectable ? (
            <td>
              <Skeleton className="ui-skeleton-box [width:16px] [height:16px] [margin:0_auto]" />
            </td>
          ) : null}
          {Array.from({ length: columnCount }, (_, col) => (
            <td key={col}>
              <Skeleton
                className="ui-skeleton-line [height:12px]"
                style={{
                  width: widths[(row + col) % widths.length],
                  animationDelay: `${row * 35 + col * 15}ms`,
                }}
              />
            </td>
          ))}
          {hasActions ? (
            <td>
              <Skeleton className="ui-skeleton-action [width:28px] [height:28px] [margin:0_auto] [border-radius:8px]" />
            </td>
          ) : null}
        </tr>
      ))}
    </>
  );
}
