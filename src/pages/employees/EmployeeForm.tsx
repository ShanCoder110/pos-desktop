import { UserRound } from "lucide-react";
import {
  CitySelect,
  Field,
  FormSection,
  PhoneField,
  SelectInput,
  TextInput,
  Toggle,
} from "@/components/common";
import type { Branch, StaffUser, UserRole } from "@/shared/domain/types";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { assignApiError, fieldMessage } from "@/utils/form";
import { shortError } from "@/utils/format";
import { formatPkMobile } from "@/utils/phone";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { EMPLOYEE_COPY, STAFF_EMPLOYEE_ROLES, staffRoleLabel } from "@/shared/constants/staff";
import { validateUserName } from "@/validations/user.validation";
import { optionalPkMobile } from "@/validations/primitives";

export const EMPLOYEE_FORM_ID = "employee-form";

export type EmployeeFormValues = {
  name: string;
  phone: string;
  role: UserRole;
  branchId: string;
  cityId: string;
  isActive: boolean;
};

export function EmployeeForm({
  employee,
  branches,
  isNew,
  onValid,
}: {
  employee: StaffUser;
  branches: Branch[];
  isNew: boolean;
  onValid: (values: EmployeeFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useAppForm<EmployeeFormValues>({
    defaultValues: {
      name: employee.name,
      phone: formatPkMobile(employee.phone),
      role: employee.role,
      branchId: employee.branchId || branches[0]?.id || "",
      cityId: employee.cityId ?? "",
      isActive: employee.isActive,
    },
  });

  return (
    <form
      id={EMPLOYEE_FORM_ID}
      className="drawer-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, EMPLOYEE_COPY.saveFailed), "name");
        }
      })}
    >
      <FormSection title="Employee details" icon={<UserRound size={14} />}>
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
        <Controller
          name="cityId"
          control={control}
          render={({ field }) => <CitySelect value={field.value} onChange={field.onChange} />}
        />
        <Field label="Employee role" error={fieldMessage(errors, "role")}>
          <Controller
            name="role"
            control={control}
            rules={{ validate: (value) => (value ? true : "Select a role") }}
            render={({ field }) => (
              <SelectInput
                value={field.value}
                onChange={(event) => field.onChange(event.target.value as UserRole)}
              >
                {STAFF_EMPLOYEE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {staffRoleLabel(role)}
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
              <strong>Active employee</strong>
              <span>Inactive staff stay in records but are off payroll</span>
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
    </form>
  );
}
