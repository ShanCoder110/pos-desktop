import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import loginHero from "@/assets/auth/login-hero.png";
import { AuthShell } from "@/components/common/auth/AuthShell";
import { toaster } from "@/components/common";
import { Field, PasswordInput, TextInput } from "@/components/common/fields";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { AUTH_COPY } from "@/shared/constants/auth";
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import { routes } from "@/shared/constants/routes";
import { useAppForm } from "@/hooks/useAppForm";
import { fieldMessage } from "@/utils/form";
import { validateUserEmail } from "@/validations/user.validation";

export function LoginPage() {
  const navigate = useNavigate();
  const { phase, shopName, login } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useAppForm({
    defaultValues: { email: "", password: "" },
  });

  if (!AUTH_ENABLED) {
    return <Navigate to={routes.dashboard} replace />;
  }

  if (phase === "needs_setup") {
    return <Navigate to={routes.setup} replace />;
  }

  if (phase === "authenticated") {
    return <Navigate to={routes.dashboard} replace />;
  }

  const displayShop = shopName ?? "POS";

  return (
    <AuthShell
      image={loginHero}
      imageAlt="Electronics shop"
      kicker={displayShop}
      title={AUTH_COPY.signIn}
      subtitle={AUTH_COPY.signInSubtitle}
      footer={null}
    >
      <form
        className="auth-form [display:grid] [gap:16px]"
        onSubmit={handleSubmit(async (values) => {
          setSubmitting(true);
          const fail = await login(values.email.trim(), values.password);
          setSubmitting(false);
          if (fail) {
            setError("password", { type: "server", message: fail });
            return;
          }
          navigate(routes.dashboard);
        })}
      >
        <Field label={AUTH_COPY.email} error={fieldMessage(errors, "email")}>
          <TextInput
            autoFocus
            type="email"
            className="is-lg"
            autoComplete="email"
            placeholder="you@shop.com"
            maxLength={FIELD_LIMITS.email}
            {...register("email", { validate: validateUserEmail })}
          />
        </Field>
        <div className="[display:grid] [gap:8px]">
          <Field label="Password" error={fieldMessage(errors, "password")}>
            <PasswordInput
              className="is-lg"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password", {
                validate: (value) => (value?.trim() ? true : FORM_COPY.passwordRequired),
              })}
            />
          </Field>
          <button
            type="button"
            className="auth-link [justify-self:start] [padding:0] [border:0] [background:transparent] [font-size:12px] [font-weight:600] [color:var(--accent)] [cursor:pointer]"
            onClick={() => toaster.info(AUTH_COPY.forgotPasswordSoon)}
          >
            {AUTH_COPY.forgotPassword}
          </button>
        </div>
        <button
          type="submit"
          disabled={submitting || phase === "loading"}
          className="auth-submit [height:44px] [width:100%] [border:0] [border-radius:8px] [background:var(--accent)] [color:#fff] [font-size:14px] [font-weight:600] [cursor:pointer] disabled:[opacity:0.6] disabled:[cursor:not-allowed]"
        >
          {submitting ? "Signing in…" : AUTH_COPY.enterShop}
        </button>
      </form>
    </AuthShell>
  );
}
