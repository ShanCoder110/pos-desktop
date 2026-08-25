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
    <div className={image ? "auth-page is-login" : "auth-page is-setup"}>
      {image ? (
        <aside className="auth-hero">
          <img src={image} alt={imageAlt ?? ""} />
          <div className="auth-hero-fade" />
          <div className="auth-hero-brand">
            <AuthBrand light />
          </div>
          <p className="auth-hero-copy">Wires, switches, meters. One stock book on the counter.</p>
        </aside>
      ) : null}

      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <AuthBrand />
        </div>
        <div className="auth-panel-inner">
          {kicker ? <p className="auth-kicker">{kicker}</p> : null}
          <h1 className="auth-title">{title}</h1>
          {subtitle ? <p className="auth-sub">{subtitle}</p> : null}
          <div className="auth-body">{children}</div>
        </div>
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </section>
    </div>
  );
}
