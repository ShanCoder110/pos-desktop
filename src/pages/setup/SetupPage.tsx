import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/common/auth/AuthShell";
import { toaster } from "@/components/common";
import { Field, PhoneField, TextArea, TextInput, PasswordInput } from "@/components/common/fields";
import { Toggle } from "@/components/common";
import { AUTH_ENABLED, useSession } from "@/shared/auth/session";
import { AUTH_COPY } from "@/shared/constants/auth";
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import { PK_MOBILE_COPY } from "@/shared/constants/phone";
import { routes } from "@/shared/constants/routes";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { fieldMessage, requiredTrim } from "@/utils/form";
import { formatPkMobile, pkMobileDigits, requiredPkMobile } from "@/utils/phone";
import { validateUserEmail } from "@/validations/user.validation";

export function SetupPage() {
  const navigate = useNavigate();
  const { phase, completeSetup } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useAppForm({
    defaultValues: {
      shopName: "",
      address: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      tagline: "",
      contactLine: "",
      showLogo: false,
    },
  });

  if (!AUTH_ENABLED) {
    return <Navigate to={routes.dashboard} replace />;
  }

  if (phase === "authenticated") {
    return <Navigate to={routes.dashboard} replace />;
  }

  if (phase !== "needs_setup" && phase !== "loading") {
    return <Navigate to={routes.login} replace />;
  }

  const email = watch("email");

  return (
    <AuthShell
      kicker={AUTH_COPY.firstTime}
      title={AUTH_COPY.setupTitle}
      subtitle={AUTH_COPY.setupSubtitle}
      footer={
        <p>
          {AUTH_COPY.alreadySetUp}{" "}
          <Link
            to={routes.login}
            className="auth-link [font-weight:600] [color:var(--accent)] [text-decoration:none]"
          >
            {AUTH_COPY.signIn}
          </Link>
        </p>
      }
    >
      <form
        className="auth-form [display:grid] [gap:16px]"
        onSubmit={handleSubmit(async (values) => {
          setSubmitting(true);
          const ownerName = `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
          const username =
            values.username.trim() ||
            values.email.trim().split("@")[0] ||
            values.firstName.trim().toLowerCase();
          const fail = await completeSetup({
            shopName: values.shopName.trim(),
            address: values.address.trim(),
            ownerName,
            username,
            password: values.password,
            phone: pkMobileDigits(values.phone),
            email: values.email.trim(),
            tagline: values.tagline.trim() || undefined,
            contactLine: values.contactLine.trim() || formatPkMobile(values.phone) || undefined,
            showLogo: values.showLogo,
          });
          setSubmitting(false);
          if (fail) {
            toaster.error(fail);
            return;
          }
          navigate(routes.dashboard);
        })}
      >
        <Field label="Shop name" error={fieldMessage(errors, "shopName")}>
          <TextInput
            autoFocus
            className="is-lg"
            placeholder="Madina Electric"
            {...register("shopName", { validate: requiredTrim(FORM_COPY.shopRequired) })}
          />
        </Field>
        <Field label="Address" error={fieldMessage(errors, "address")}>
          <TextArea
            className="is-lg"
            maxLength={FIELD_LIMITS.address}
            placeholder="Shop 12, Hall Road, Lahore"
            {...register("address", { validate: requiredTrim(FORM_COPY.addressRequired) })}
          />
        </Field>
        <Field label={AUTH_COPY.tagline} hint={AUTH_COPY.taglineHint}>
          <TextInput
            className="is-lg"
            placeholder="Quality parts, fair prices"
            {...register("tagline")}
          />
        </Field>
        <div className="auth-form-row [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]">
          <Field label="First name" error={fieldMessage(errors, "firstName")}>
            <TextInput
              className="is-lg"
              placeholder="Usman"
              {...register("firstName", { validate: requiredTrim(FORM_COPY.firstNameRequired) })}
            />
          </Field>
          <Field label="Last name" error={fieldMessage(errors, "lastName")}>
            <TextInput
              className="is-lg"
              placeholder="Ali"
              {...register("lastName", { validate: requiredTrim(FORM_COPY.lastNameRequired) })}
            />
          </Field>
        </div>
        <Controller
          name="phone"
          control={control}
          rules={{
            validate: (value) =>
              requiredPkMobile(value, FORM_COPY.phoneRequired, PK_MOBILE_COPY.invalid),
          }}
          render={({ field }) => (
            <PhoneField
              error={fieldMessage(errors, "phone")}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputClassName="is-lg"
            />
          )}
        />
        <Field label="Email" error={fieldMessage(errors, "email")}>
          <TextInput
            className="is-lg"
            type="email"
            placeholder="usman@shop.com"
            {...register("email", { validate: validateUserEmail })}
          />
        </Field>
        <Field label={AUTH_COPY.username} hint="Internal label for receipts and staff lists">
          <TextInput
            className="is-lg"
            placeholder={email.trim().split("@")[0] || "owner"}
            {...register("username")}
          />
        </Field>
        <Field label={AUTH_COPY.contactLine} hint={AUTH_COPY.contactLineHint}>
          <TextInput className="is-lg" placeholder="0300 1234567" {...register("contactLine")} />
        </Field>
        <Controller
          name="showLogo"
          control={control}
          render={({ field }) => (
            <Toggle checked={field.value} onChange={field.onChange} label={AUTH_COPY.showLogo} />
          )}
        />
        <Field label="Password" error={fieldMessage(errors, "password")}>
          <PasswordInput
            className="is-lg"
            autoComplete="new-password"
            placeholder="••••••••"
            {...register("password", {
              validate: (value) => (value.length >= 6 ? true : AUTH_COPY.passwordMin),
            })}
          />
        </Field>
        <Field label={AUTH_COPY.confirmPassword} error={fieldMessage(errors, "confirmPassword")}>
          <PasswordInput
            className="is-lg"
            autoComplete="new-password"
            placeholder="••••••••"
            {...register("confirmPassword", {
              validate: (value, formValues) => {
                if (!value) return FORM_COPY.confirmPasswordRequired;
                return value === formValues.password ? true : AUTH_COPY.passwordMismatch;
              },
            })}
          />
        </Field>
        <button
          type="submit"
          disabled={submitting || phase === "loading"}
          className="auth-submit [height:44px] [width:100%] [border:0] [border-radius:8px] [background:var(--accent)] [color:#fff] [font-size:14px] [font-weight:600] [cursor:pointer] disabled:[opacity:0.6] disabled:[cursor:not-allowed]"
        >
          {submitting ? "Creating shop…" : AUTH_COPY.createShop}
        </button>
      </form>
    </AuthShell>
  );
}
