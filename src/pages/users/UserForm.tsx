import { KeyRound, Mail, Shield, UserRound } from "lucide-react";
import {
  CitySelect,
  Field,
  FormSection,
  PhoneField,
  SelectInput,
  TextInput,
  PasswordInput,
  Toggle,
} from "@/components/common";
import type { Branch, StaffUser, UserAccessRole } from "@/shared/domain/types";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { assignApiError, fieldMessage } from "@/utils/form";
import { shortError } from "@/utils/format";
import { formatPkMobile } from "@/utils/phone";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import {
  DEFAULT_STAFF_PASSWORD,
  USER_ACCESS_ROLES,
  USERS_COPY,
  defaultPermissionsForRole,
  userAccessRoleLabel,
} from "@/shared/constants/staff";
import { validateUserEmail, validateUserName } from "@/validations/user.validation";
import { optionalPkMobile } from "@/validations/primitives";
import { UserPermissionEditor } from "@/pages/users/UserPermissionEditor";

export const USER_FORM_ID = "pos-user-form";

export type UserFormValues = {
  name: string;
  phone: string;
  email: string;
  password: string;
  role: UserAccessRole;
  branchId: string;
  cityId: string;
  isActive: boolean;
  permissions: Record<string, boolean>;
};

export function UserForm({
  user,
  branches,
  isNew,
  onValid,
}: {
  user: StaffUser;
  branches: Branch[];
  isNew: boolean;
  onValid: (values: UserFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useAppForm<UserFormValues>({
    defaultValues: {
      name: user.name,
      phone: formatPkMobile(user.phone),
      email: user.email,
      password: "",
      role: (user.role as UserAccessRole) || "CASHIER",
      branchId: user.branchId || branches[0]?.id || "",
      cityId: user.cityId ?? "",
      isActive: user.isActive,
      permissions: user.permissions ?? defaultPermissionsForRole("CASHIER"),
    },
  });

  const role = watch("role");
  const permissions = watch("permissions");

  return (
    <form
      id={USER_FORM_ID}
      className="drawer-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, USERS_COPY.saveFailed), "email");
        }
      })}
    >
      <FormSection title="User details" icon={<UserRound size={14} />}>
        <Field label="Name" error={fieldMessage(errors, "name")}>
          <TextInput
            autoFocus
            startIcon={<UserRound size={15} />}
            placeholder="Enter name"
            maxLength={FIELD_LIMITS.name}
            {...register("name", { validate: validateUserName })}
          />
        </Field>
        <Controller
          name="phone"
          control={control}
          rules={{ validate: optionalPkMobile }}
          render={({ field }) => (
            <PhoneField
              error={fieldMessage(errors, "phone")}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <Field label="Email" error={fieldMessage(errors, "email")}>
          <TextInput
            type="email"
            startIcon={<Mail size={15} />}
            placeholder="e.g. ali@shop.pk"
            maxLength={FIELD_LIMITS.email}
            {...register("email", { validate: validateUserEmail })}
          />
        </Field>
        <Controller
          name="cityId"
          control={control}
          render={({ field }) => <CitySelect value={field.value} onChange={field.onChange} />}
        />
        <Field
          label={isNew ? "Password" : "New password"}
          hint={
            isNew ? `Leave blank to use ${DEFAULT_STAFF_PASSWORD}` : "Leave blank to keep current"
          }
          error={fieldMessage(errors, "password")}
        >
          <PasswordInput
            startIcon={<KeyRound size={15} />}
            placeholder={isNew ? "Enter password" : "Enter new password"}
            maxLength={FIELD_LIMITS.password}
            autoComplete={isNew ? "new-password" : "new-password"}
            {...register("password")}
          />
        </Field>
        {!isNew ? (
          <Field label="Username" hint="Sign-in name">
            <TextInput value={user.username} disabled />
          </Field>
        ) : null}
      </FormSection>

      <FormSection title="Access" icon={<Shield size={14} />}>
        <Field label="User role">
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <SelectInput
                value={field.value}
                onChange={(event) => {
                  const nextRole = event.target.value as UserAccessRole;
                  field.onChange(nextRole);
                  setValue("permissions", defaultPermissionsForRole(nextRole));
                }}
              >
                {USER_ACCESS_ROLES.map((item) => (
                  <option key={item} value={item}>
                    {userAccessRoleLabel(item)}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>
        <Field label="Branch" error={fieldMessage(errors, "branchId")}>
          <Controller
            name="branchId"
            control={control}
            rules={{ validate: (value) => (value ? true : "Select a branch") }}
            render={({ field }) => (
              <SelectInput
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectInput>
            )}
          />
        </Field>
        {!isNew ? (
          <div className="supplier-active-card">
            <div>
              <strong>Active user</strong>
              <span>Can sign in when on</span>
            </div>
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <Toggle checked={field.value} onChange={field.onChange} label="" />
              )}
            />
          </div>
        ) : null}
      </FormSection>

      <FormSection title={USERS_COPY.permissionsTitle} icon={<Shield size={14} />}>
        <Controller
          name="permissions"
          control={control}
          render={({ field }) => (
            <UserPermissionEditor
              value={permissions}
              onChange={field.onChange}
              disabled={role === "OWNER"}
            />
          )}
        />
      </FormSection>
    </form>
  );
}
