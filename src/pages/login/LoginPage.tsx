import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import loginHero from "@/assets/auth/login-hero.png";
import { AuthShell } from "@/components/common/auth/AuthShell";
import { Field, TextInput } from "@/components/common/fields";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { routes } from "@/shared/constants/routes";

export function LoginPage() {
  const navigate = useNavigate();
  const { session, login } = useSession();
  const [email, setEmail] = useState(session.owner?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!AUTH_ENABLED) {
    return <Navigate to={routes.dashboard} replace />;
  }

  const shopName = session.shop?.name ?? "POS";
  const needsSetup = !session.shop || !session.owner;

  return (
    <AuthShell
      image={loginHero}
      imageAlt="Electronics shop"
      kicker={shopName}
      title="Sign in"
      subtitle="Staff enter the shop with the email and password set at setup."
      footer={
        needsSetup ? (
          <p>
            First time?{" "}
            <Link to={routes.setup} className="auth-link [font-weight:600] [color:var(--accent)] [text-decoration:none]">
              Set up the shop
            </Link>
          </p>
        ) : null
      }
    >
      <form
        className="auth-form [display:grid] [gap:16px]"
        onSubmit={(e) => {
          e.preventDefault();
          const fail = login(email, password);
          if (fail) {
            setError(fail);
            return;
          }
          navigate(routes.dashboard);
        }}
      >
        <Field label="Email">
          <TextInput
            autoFocus
            className="is-lg"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@shop.com"
          />
        </Field>
        <Field label="Password">
          <TextInput
            className="is-lg"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {error ? <p className="auth-error [font-size:12px] [color:var(--danger)]">{error}</p> : null}
        <button type="submit" className="auth-submit [height:44px] [width:100%] [border:0] [border-radius:8px] [background:var(--accent)] [color:#fff] [font-size:14px] [font-weight:600] [cursor:pointer]">
          Enter shop
        </button>
      </form>
    </AuthShell>
  );
}
