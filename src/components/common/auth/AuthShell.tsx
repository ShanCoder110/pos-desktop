import type { ReactNode } from "react";
import { AuthBrand } from "@/components/common/auth/AuthBrand";

export function AuthShell({
  image,
  imageAlt,
  kicker,
  title,
  subtitle,
  footer,
  children,
}: {
  image?: string;
  imageAlt?: string;
  kicker?: string;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={image ? "auth-page [height:100%] [min-height:0] [background:var(--shell)] [color:var(--ink)] is-login" : "auth-page [height:100%] [min-height:0] [background:var(--shell)] [color:var(--ink)] is-setup"}>
      {image ? (
        <aside className="auth-hero [display:none] [position:relative] [min-height:0] [overflow:hidden]">
          <img src={image} alt={imageAlt ?? ""} />
          <div className="auth-hero-fade [position:absolute] [inset:0] [background:linear-gradient(_to_top,_color-mix(in_srgb,_var(--header)_80%,_transparent),_color-mix(in_srgb,_var(--header)_20%,_transparent),_transparent_)]" />
          <div className="auth-hero-brand [position:absolute] [top:24px] [left:24px]">
            <AuthBrand light />
          </div>
          <p className="auth-hero-copy [position:absolute] [right:32px] [bottom:32px] [left:32px] [max-width:28rem] [font-size:15px] [line-height:1.5] [font-weight:500] [color:#fff]">Wires, switches, meters. One stock book on the counter.</p>
        </aside>
      ) : null}

      <section className="auth-panel [display:flex] [flex-direction:column] [min-height:0] [overflow:hidden] [background:var(--paper)] [padding:32px_24px]">
        <div className="auth-mobile-brand [margin-bottom:32px]">
          <AuthBrand />
        </div>
        <div className="auth-panel-inner [width:100%] [max-width:380px] [margin:0_auto] [flex:1] [display:flex] [flex-direction:column] [justify-content:center]">
          {kicker ? <p className="auth-kicker [font-size:11px] [font-weight:700] [letter-spacing:0.14em] [text-transform:uppercase] [color:var(--accent)]">{kicker}</p> : null}
          <h1 className="auth-title [margin-top:4px] [font-size:26px] [line-height:1.15] [font-weight:800] [letter-spacing:-0.02em] [color:var(--ink)]">{title}</h1>
          {subtitle ? <p className="auth-sub [margin-top:8px] [font-size:14px] [line-height:1.5] [color:var(--sub)]">{subtitle}</p> : null}
          <div className="auth-body [margin-top:28px]">{children}</div>
        </div>
        {footer ? <div className="auth-footer [width:100%] [max-width:380px] [margin:32px_auto_0] [font-size:12px] [color:var(--muted)]">{footer}</div> : null}
      </section>
    </div>
  );
}
