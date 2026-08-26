import posMark from "@/assets/auth/pos-mark.png";

export function AuthBrand({ light }: { light?: boolean }) {
  return (
    <div className={light ? "auth-brand [display:flex] [align-items:center] [gap:10px] is-light" : "auth-brand [display:flex] [align-items:center] [gap:10px]"}>
      <img src={posMark} alt="" />
      <div>
        <p className="auth-brand-name [font-size:15px] [font-weight:800] [letter-spacing:-0.02em] [color:var(--ink)]">POS</p>
        <p className="auth-brand-tag [font-size:11px] [font-weight:500] [color:var(--muted)]">Shop counter</p>
      </div>
    </div>
  );
}
