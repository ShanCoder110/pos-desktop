import { Building2, MapPin, Scale } from "lucide-react";
import {
  CitySelect,
  Field,
  FormSection,
  MoneyInput,
  MoneyDisplay,
  PhoneField,
  TextInput,
  Toggle,
} from "@/components/common";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import type { SupplierRow } from "@/shared/domain/types";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { assignApiError, fieldMessage } from "@/utils/form";
import { cn, limitMoneyDraft, money, shortError } from "@/utils/format";
import { formatPkMobile } from "@/utils/phone";
import { validateSupplierName, validateSupplierPhone } from "@/validations/supplier.validation";
import {
  SUPPLIER_BALANCE_SETTLED,
  SUPPLIER_COPY,
  SUPPLIER_OPENING_THEY_OWE,
  SUPPLIER_OPENING_WE_OWE,
} from "@/shared/constants/suppliers";

export const SUPPLIER_FORM_ID = "supplier-form";

export type SupplierFormValues = {
  name: string;
  phone: string;
  cityId: string;
  address: string;
  previousBalance: string;
  openingSide: typeof SUPPLIER_OPENING_WE_OWE | typeof SUPPLIER_OPENING_THEY_OWE;
  isActive: boolean;
};

function openingAmount(raw: string | undefined) {
  const cleaned = (raw ?? "").replace(/,/g, "").trim();
  const value = Math.abs(Number(cleaned));
  return Number.isFinite(value) ? value : 0;
}

export function SupplierEditForm({
  row,
  isNew,
  onValid,
}: {
  row: SupplierRow;
  isNew: boolean;
  onValid: (values: SupplierFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useAppForm<SupplierFormValues>({
    defaultValues: {
      name: row.name,
      phone: formatPkMobile(row.phone),
      cityId: row.cityId ?? "",
      address: row.address,
      previousBalance: row.previousBalance ?? "",
      openingSide: row.openingSide ?? SUPPLIER_OPENING_WE_OWE,
      isActive: row.isActive,
    },
  });
  const openingSide = watch("openingSide");
  const previousBalance = watch("previousBalance");

  return (
    <form
      id={SUPPLIER_FORM_ID}
      className="drawer-form"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          assignApiError(setError, shortError(error, SUPPLIER_COPY.saveFailed), "name");
        }
      })}
    >
      <FormSection title="Supplier details" icon={<Building2 size={14} />}>
        <Field label="Name" error={fieldMessage(errors, "name")}>
          <TextInput
            autoFocus
            startIcon={<Building2 size={15} />}
            placeholder="Enter name"
            maxLength={FIELD_LIMITS.name}
            {...register("name", { validate: validateSupplierName })}
          />
        </Field>
        <Controller
          name="phone"
          control={control}
          rules={{ validate: validateSupplierPhone }}
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
        <Field label="Address">
          <TextInput
            startIcon={<MapPin size={15} />}
            placeholder="Enter address"
            maxLength={FIELD_LIMITS.address}
            {...register("address")}
          />
        </Field>
        {!isNew ? (
          <div className="supplier-active-card">
            <div>
              <strong>Active supplier</strong>
              <span>Show when receiving stock</span>
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

      <FormSection
        title={isNew ? SUPPLIER_COPY.openingLabel : "Balance"}
        icon={<Scale size={14} />}
      >
        {isNew ? (
          <div
            className={cn(
              "supplier-opening",
              openingSide === SUPPLIER_OPENING_THEY_OWE ? "is-advance" : "is-owe",
              !openingAmount(previousBalance) && "is-zero",
            )}
          >
            <Controller
              name="openingSide"
              control={control}
              render={({ field }) => (
                <div className="supplier-opening-sides">
                  <button
                    type="button"
                    className={cn(
                      "supplier-opening-side is-owe",
                      field.value !== SUPPLIER_OPENING_THEY_OWE && "is-on",
                    )}
                    onClick={() => field.onChange(SUPPLIER_OPENING_WE_OWE)}
                  >
                    {SUPPLIER_COPY.payable}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "supplier-opening-side is-advance",
                      field.value === SUPPLIER_OPENING_THEY_OWE && "is-on",
                    )}
                    onClick={() => field.onChange(SUPPLIER_OPENING_THEY_OWE)}
                  >
                    {SUPPLIER_COPY.advance}
                  </button>
                </div>
              )}
            />
            <Field
              label={SUPPLIER_COPY.openingAmount}
              hint={
                openingSide === SUPPLIER_OPENING_THEY_OWE
                  ? SUPPLIER_COPY.advanceHint
                  : SUPPLIER_COPY.payableHint
              }
            >
              <Controller
                name="previousBalance"
                control={control}
                render={({ field }) => (
                  <MoneyInput
                    placeholder="0"
                    className={
                      openingAmount(field.value)
                        ? openingSide === SUPPLIER_OPENING_THEY_OWE
                          ? "[color:var(--sale)] [font-weight:750]"
                          : "[color:var(--hold)] [font-weight:750]"
                        : undefined
                    }
                    value={field.value}
                    onChange={(event) => {
                      const next = event.target.value;
                      field.onChange(limitMoneyDraft(next.replace(/^\s*-/, "")));
                    }}
                  />
                )}
              />
            </Field>
            <p className="supplier-opening-readout">
              {openingAmount(previousBalance)
                ? `${money(openingAmount(previousBalance))} — ${openingSide === SUPPLIER_OPENING_THEY_OWE ? SUPPLIER_COPY.advanceSummary : SUPPLIER_COPY.payableSummary}`
                : SUPPLIER_COPY.openingNone}
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "supplier-opening",
              row.currentBalance < 0 ? "is-advance" : row.currentBalance > 0 ? "is-owe" : "is-zero",
            )}
          >
            <Field
              label="Balance"
              hint={`${row.currentBalance < 0 ? SUPPLIER_COPY.advance : row.currentBalance > 0 ? SUPPLIER_COPY.payable : SUPPLIER_BALANCE_SETTLED} · ${SUPPLIER_COPY.ledgerBalanceHint}`}
            >
              <MoneyDisplay value={row.currentBalance} />
            </Field>
          </div>
        )}
      </FormSection>
    </form>
  );
}
