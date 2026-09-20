import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyRow,
  Field,
  KpiCard,
  PageHead,
  PhoneField,
  Table,
  Td,
  TextInput,
  THead,
  Th,
  Toggle,
  SelectInput,
  toaster,
} from "@/components/common";
import type { Branch, BranchSetting, BranchType } from "@/shared/domain/types";
import { FIELD_LIMITS } from "@/shared/constants/fields";
import { PK_MOBILE_COPY } from "@/shared/constants/phone";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { fieldMessage, requiredTrim } from "@/utils/form";
import { formatPkMobile, optionalPkMobile } from "@/utils/phone";
import { ensureSession } from "@/services/auth";
import { handleApiError } from "@/utils/apiError";
import {
  createBranch,
  listAllBranches,
  mapBranch,
  mapBranchSetting,
  updateBranch,
} from "@/services/org";

function typeTone(t: BranchType) {
  if (t === "STORE") return "ok" as const;
  if (t === "WAREHOUSE") return "info" as const;
  if (t === "REPAIR") return "warn" as const;
  return "info" as const;
}

const SHOP_FORM_ID = "shop-form";

function blankBranch(): Branch {
  return {
    id: "",
    name: "",
    code: "",
    type: "STORE",
    phone: "",
    address: "",
    isActive: true,
  };
}

type ShopFormValues = {
  name: string;
  type: BranchType;
  phone: string;
  address: string;
  fifoEnabled: boolean;
  allowNegativeStock: boolean;
};

function ShopEditForm({
  branch,
  isNew,
  fifoEnabled,
  allowNegativeStock,
  saving,
  onValid,
}: {
  branch: Branch;
  isNew: boolean;
  fifoEnabled: boolean;
  allowNegativeStock: boolean;
  saving: boolean;
  onValid: (values: ShopFormValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useAppForm<ShopFormValues>({
    defaultValues: {
      name: branch.name,
      type: branch.type,
      phone: formatPkMobile(branch.phone),
      address: branch.address,
      fifoEnabled,
      allowNegativeStock,
    },
  });

  return (
    <form
      id={SHOP_FORM_ID}
      className="ui-stack grid gap-3"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onValid(values);
        } catch (error) {
          toaster.error(handleApiError(error, "Could not save branch"));
        }
      })}
    >
      <Field label="Name" error={fieldMessage(errors, "name")}>
        <TextInput
          autoFocus
          placeholder="e.g. Main Store"
          disabled={saving}
          {...register("name", { validate: requiredTrim("Name is required") })}
        />
      </Field>
      {!isNew ? (
        <Field label="Code">
          <TextInput value={branch.code} readOnly disabled />
        </Field>
      ) : null}
      <Field label="Type">
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              disabled={saving}
              onChange={(event) => field.onChange(event.target.value as BranchType)}
            >
              <option value="STORE">Store</option>
              <option value="WAREHOUSE">Warehouse</option>
              <option value="REPAIR">Repair</option>
              <option value="PRODUCTION">Production</option>
            </SelectInput>
          )}
        />
      </Field>
      <Controller
        name="phone"
        control={control}
        rules={{ validate: (value) => optionalPkMobile(value, PK_MOBILE_COPY.invalid) }}
        render={({ field }) => (
          <PhoneField
            error={fieldMessage(errors, "phone")}
            value={field.value}
            disabled={saving}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Field label="Address">
        <TextInput
          maxLength={FIELD_LIMITS.address}
          placeholder="e.g. Hall Road, Lahore"
          disabled={saving}
          {...register("address")}
        />
      </Field>
      <div className="grid gap-2 rounded-xl border border-line bg-paper p-3">
        <Controller
          name="fifoEnabled"
          control={control}
          render={({ field }) => (
            <Toggle
              checked={field.value}
              onChange={(checked) => field.onChange(checked)}
              label="Sell oldest lots first (FIFO)"
            />
          )}
        />
        <p className="m-0 text-[11px] leading-relaxed text-muted">
          When on, sales at this branch use stock from the oldest received lots first for cost and
          supplier tracking.
        </p>
        <Controller
          name="allowNegativeStock"
          control={control}
          render={({ field }) => (
            <Toggle
              checked={field.value}
              onChange={(checked) => field.onChange(checked)}
              label="Allow negative stock"
            />
          )}
        />
        <p className="m-0 text-[11px] leading-relaxed text-muted">
          When on, this branch can sell below zero quantity instead of blocking the sale.
        </p>
      </div>
    </form>
  );
}

export function ShopsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [settings, setSettings] = useState<BranchSetting[]>([]);
  const [open, setOpen] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const rows = await listAllBranches(signal).catch(() => []);
    setBranches(rows.map(mapBranch));
    setSettings(rows.map(mapBranchSetting).filter((s): s is BranchSetting => s !== null));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      await refresh(controller.signal);
    })();
    return () => controller.abort();
  }, [refresh]);

  const setting = useMemo(() => {
    const map = new Map<string, BranchSetting>();
    settings.forEach((s) => map.set(s.branchId, s));
    return (id: string) => map.get(id);
  }, [settings]);

  const isNew = Boolean(open && !open.id);

  async function saveBranch(values: ShopFormValues) {
    if (!open || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        type: values.type,
        phone: values.phone.trim() || undefined,
        address: values.address.trim() || undefined,
        isActive: open.isActive,
        settings: {
          fifoEnabled: values.fifoEnabled,
          allowNegativeStock: values.allowNegativeStock,
        },
      };
      if (isNew) {
        await createBranch(payload);
        toaster.success("Branch added");
      } else {
        await updateBranch(open.id, { ...payload, code: open.code });
        toaster.success("Branch saved");
      }
      await refresh();
      setOpen(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-stack grid gap-3">
      <PageHead title="Branches">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setOpen(blankBranch())}>
          Add branch
        </Button>
      </PageHead>
      <p className="ui-note text-[12px] leading-relaxed text-muted">
        STORE sells. WAREHOUSE holds bulk lots. REPAIR and PRODUCTION consume components. Branch
        code is generated from the name when you create a branch.
      </p>
      <div className="ui-kpi-row grid grid-cols-5 gap-2.5">
        <KpiCard
          label="Active"
          value={branches.filter((b) => b.isActive).length}
          hint="In use"
          tone="ok"
        />
        <KpiCard
          label="Stores"
          value={branches.filter((b) => b.type === "STORE").length}
          hint="POS counters"
          tone="info"
        />
        <KpiCard
          label="FIFO"
          value={settings.filter((s) => s.branchLotEnabled).length}
          hint="Oldest lots first"
          tone="warn"
        />
      </div>
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Code</Th>
            <Th>Type</Th>
            <Th>Phone</Th>
            <Th>FIFO</Th>
            <Th>Negative stock</Th>
            <Th>Active</Th>
            <Th />
          </tr>
        </THead>
        <tbody>
          {branches.length === 0 ? <EmptyRow cols={8} /> : null}
          {branches.map((row) => {
            const s = setting(row.id);
            return (
              <tr key={row.id}>
                <Td>{row.name}</Td>
                <Td>{row.code}</Td>
                <Td>
                  <Badge tone={typeTone(row.type)}>{row.type}</Badge>
                </Td>
                <Td>{row.phone}</Td>
                <Td>
                  <Badge tone={s?.branchLotEnabled ? "ok" : "info"}>
                    {s?.branchLotEnabled ? "On" : "Off"}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={s?.allowNegativeStock ? "warn" : "ok"}>
                    {s?.allowNegativeStock ? "Allowed" : "Blocked"}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={row.isActive ? "ok" : "danger"}>{row.isActive ? "Yes" : "No"}</Badge>
                </Td>
                <Td>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setOpen(row)}
                    aria-label="Edit"
                  >
                    <Pencil size={15} />
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Drawer
        open={Boolean(open)}
        title={isNew ? "Add branch" : (open?.name ?? "Branch")}
        onClose={() => {
          if (!saving) setOpen(null);
        }}
        footer={
          <>
            <Button disabled={saving} onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={SHOP_FORM_ID} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Add branch" : "Save"}
            </Button>
          </>
        }
      >
        {open ? (
          <ShopEditForm
            key={open.id || "new"}
            branch={open}
            isNew={isNew}
            fifoEnabled={Boolean(setting(open.id)?.branchLotEnabled ?? true)}
            allowNegativeStock={Boolean(setting(open.id)?.allowNegativeStock)}
            saving={saving}
            onValid={saveBranch}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
