import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/common/auth/AuthShell";
import { Field, TextArea, TextInput } from "@/components/common/fields";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { routes } from "@/shared/constants/routes";

export function SetupPage() {
  const navigate = useNavigate();
  const { session, completeSetup } = useSession();
  const [shopName, setShopName] = useState(session.shop?.name ?? "");
  const [address, setAddress] = useState(session.shop?.address ?? "");
  const [firstName, setFirstName] = useState(session.owner?.firstName ?? "");
  const [lastName, setLastName] = useState(session.owner?.lastName ?? "");
  const [phone, setPhone] = useState(session.owner?.phone ?? "");
  const [email, setEmail] = useState(session.owner?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!AUTH_ENABLED) {
    return <Navigate to={routes.dashboard} replace />;
  }

  if (session.shop && session.owner) {
    return <Navigate to={session.loggedIn ? routes.pos : routes.login} replace />;
  }

  return (
    <AuthShell
      kicker="First time"
      title="Set up your shop"
      subtitle="Name the shop, then create the first login. You will sign in with this email."
      footer={
        <p>
          Already set up?{" "}
          <Link to={routes.login} className="auth-link [font-weight:600] [color:var(--accent)] [text-decoration:none]">
            Sign in
          </Link>
        </p>
      }
    >
      <form
        className="auth-form [display:grid] [gap:16px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!shopName.trim()) {
            setError("Shop name is required");
            return;
          }
          if (!address.trim()) {
            setError("Address is required");
            return;
          }
          if (!firstName.trim() || !lastName.trim()) {
            setError("First and last name are required");
            return;
          }
          if (!phone.trim()) {
            setError("Phone is required");
            return;
          }
          if (!email.trim() || !email.includes("@")) {
            setError("A valid email is required");
            return;
          }
          if (password.length < 4) {
            setError("Password must be at least 4 characters");
            return;
          }
          completeSetup(
            { name: shopName.trim(), address: address.trim() },
            {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phone.trim(),
              email: email.trim(),
              password,
            },
          );
          navigate(routes.login);
        }}
      >
        <Field label="Shop name">
          <TextInput
            autoFocus
            className="is-lg"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Madina Electric"
          />
        </Field>
        <Field label="Address">
          <TextArea
            className="is-lg"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Shop 12, Hall Road, Lahore"
          />
        </Field>
        <div className="auth-form-row [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]">
          <Field label="First name">
            <TextInput
              className="is-lg"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Usman"
            />
          </Field>
          <Field label="Last name">
            <TextInput
              className="is-lg"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Ali"
            />
          </Field>
        </div>
        <Field label="Phone">
          <TextInput
            className="is-lg"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0300 1112233"
          />
        </Field>
        <Field label="Email">
          <TextInput
            className="is-lg"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usman@shop.com"
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
          Create shop
        </button>
      </form>
    </AuthShell>
  );
}
