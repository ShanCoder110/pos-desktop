import { MapPin, UserRound } from "lucide-react";
import { Field, MoneyInput, PhoneField, TextInput } from "@/components/common";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import {
  CUSTOMER_BALANCE_ADVANCE,
  CUSTOMER_BALANCE_OWES,
  CUSTOMER_BALANCE_SETTLED,
  CUSTOMER_COPY,
} from "@/shared/constants/customers";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import type { DomainCustomer } from "@/shared/domain/types";
import { adjustDelta, balanceInputDraft, cn, limitMoneyDraft, money } from "@/utils/format";
import { fieldMessage } from "@/utils/form";
import { formatPkMobile, pkMobileDigits } from "@/utils/phone";
import { validateCustomerName, validateCustomerPhone } from "@/validations/customer.validation";

export const CREDIT_CUSTOMER_EDIT_FORM_ID = "credit-customer-edit-form";

export type CreditBalanceSide = "owe" | "advance";

export type CreditCustomerEditValues = {
  name: string;
  phone: string;
  address: string;
  amount: string;
  side: CreditBalanceSide;
};

function openingAmount(raw: string | undefined) {
  const cleaned = (raw ?? "").replace(/,/g, "").trim();
  const value = Math.abs(Number(cleaned));
  return Number.isFinite(value) ? value : 0;
}

function targetBalance(amount: string, side: CreditBalanceSide) {
  const magnitude = openingAmount(amount);
  return side === "owe" ? magnitude : -magnitude;
}

function balanceLabel(n: number) {
  if (n > 0) return CUSTOMER_BALANCE_OWES;
  if (n < 0) return CUSTOMER_BALANCE_ADVANCE;
  return CUSTOMER_BALANCE_SETTLED;
}

function balanceAmountText(n: number) {
  if (n === 0) return money(0);
  return money(Math.abs(n));
}

/** Ledger note describing previous → after and how much was added or deducted. */
export function creditBalanceAdjustNote(previous: number, next: number): string {
  const delta = next - previous;
  const change =
    delta > 0 ? `added ${money(delta)}` : delta < 0 ? `deducted ${money(-delta)}` : "unchanged";
  return `Balance adjusted: previous ${balanceLabel(previous)} ${balanceAmountText(previous)} → ${balanceLabel(next)} ${balanceAmountText(next)} (${change})`;
}

export function CreditCustomerEditForm({
  customer,
  onValid,
}: {
  customer: DomainCustomer;
  onValid: (values: CreditCustomerEditValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useAppForm<CreditCustomerEditValues>({
    defaultValues: {
      name: customer.name,
      phone: formatPkMobile(customer.phone),
      address: customer.address ?? "",
      amount: balanceInputDraft(customer.currentBalance),
      side: customer.currentBalance < 0 ? "advance" : "owe",
    },
  });

  const side = watch("side");
  const amount = watch("amount");
  const next = targetBalance(amount, side);
  const delta = next - customer.currentBalance;

  return (
    <form
      id={CREDIT_CUSTOMER_EDIT_FORM_ID}
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        await onValid({ ...values, phone: pkMobileDigits(values.phone) });
      })}
    >
      <div className="rounded-xl border border-line bg-[var(--surface)] p-4">
        <div className="grid gap-4">
          <Field label="Customer name" error={fieldMessage(errors, "name")}>
            <TextInput
              autoFocus
              startIcon={<UserRound size={15} />}
              placeholder="Customer name"
              maxLength={FIELD_LIMITS.name}
              {...register("name", { validate: validateCustomerName })}
            />
          </Field>
          <Controller
            name="phone"
            control={control}
            rules={{ validate: validateCustomerPhone }}
            render={({ field }) => (
              <PhoneField
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldMessage(errors, "phone")}
              />
            )}
          />
          <Field label="Address">
            <TextInput
              startIcon={<MapPin size={15} />}
              placeholder="Optional address"
              maxLength={FIELD_LIMITS.address}
              {...register("address")}
            />
          </Field>

          <Field label={CUSTOMER_COPY.adjustBalanceLabel} error={fieldMessage(errors, "amount")}>
            <div className="grid gap-2">
              <Controller
                name="side"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold",
                        field.value === "owe"
                          ? "border-[var(--danger)] bg-[var(--danger)] text-white"
                          : "border-line bg-paper text-sub hover:bg-bg",
                      )}
                      onClick={() => field.onChange("owe")}
                    >
                      {CUSTOMER_COPY.adjustOwes}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-semibold",
                        field.value === "advance"
                          ? "border-[var(--ok)] bg-[var(--ok)] text-white"
                          : "border-line bg-paper text-sub hover:bg-bg",
                      )}
                      onClick={() => field.onChange("advance")}
                    >
                      {CUSTOMER_COPY.adjustAdvance}
                    </button>
                  </div>
                )}
              />
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <MoneyInput
                    placeholder="0"
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(limitMoneyDraft(event.target.value.replace(/^\s*-/, "")))
                    }
                  />
                )}
              />
              {delta !== 0 ? (
                <p
                  className={cn(
                    "text-[12px] font-bold tabular-nums",
                    delta > 0 ? "text-[var(--danger)]" : "text-[var(--ok)]",
                  )}
                >
                  {adjustDelta(delta)}
                  <span className="ml-1.5 font-medium text-muted">
                    · {side === "owe" ? CUSTOMER_COPY.adjustOwes : CUSTOMER_COPY.adjustAdvance}
                  </span>
                </p>
              ) : null}
            </div>
          </Field>
        </div>
      </div>
    </form>
  );
}
