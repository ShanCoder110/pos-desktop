import posMark from "@/assets/auth/pos-mark.png";

export function AuthBrand({ light }: { light?: boolean }) {
  return (
    <div className={light ? "auth-brand is-light" : "auth-brand"}>
      <img src={posMark} alt="" />
      <div>
        <p className="auth-brand-name">POS</p>
        <p className="auth-brand-tag">Shop counter</p>
      </div>
    </div>
  );
}
