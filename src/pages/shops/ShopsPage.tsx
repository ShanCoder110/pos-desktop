import { useEffect, useMemo, useState } from "react";
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
} from "@/components/common";
import type { Branch, BranchSetting, BranchType } from "@/shared/domain/types";
import { FIELD_LIMITS, FORM_COPY } from "@/shared/constants/fields";
import { PK_MOBILE_COPY } from "@/shared/constants/phone";
import { Controller, useAppForm } from "@/hooks/useAppForm";
import { fieldMessage, requiredTrim } from "@/utils/form";
import { formatPkMobile, optionalPkMobile } from "@/utils/phone";
import { ensureSession } from "@/services/auth";
import { listAllBranches, mapBranch, mapBranchSetting } from "@/services/org";

function typeTone(t: BranchType) {
  if (t === "STORE") return "ok" as const;
  if (t === "WAREHOUSE") return "info" as const;
  if (t === "REPAIR") return "warn" as const;
  return "info" as const;
}

const SHOP_FORM_ID = "shop-form";

function ShopEditForm({
  branch,
  lotEnabled,
  negativeStock,
  onValid,
}: {
  branch: Branch;
  lotEnabled: boolean;
  negativeStock: boolean;
  onValid: () => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useAppForm({
    defaultValues: {
      name: branch.name,
      code: branch.code,
      type: branch.type,
      phone: formatPkMobile(branch.phone),
      address: branch.address,
    },
  });
  return (
    <form
      id={SHOP_FORM_ID}
      className="ui-stack [display:grid] [gap:12px]"
      onSubmit={handleSubmit(() => onValid())}
    >
      <Field label="Name" error={fieldMessage(errors, "name")}>
        <TextInput
          placeholder="e.g. Main Store"
          {...register("name", { validate: requiredTrim(FORM_COPY.nameRequired) })}
        />
      </Field>
      <Field label="Code" error={fieldMessage(errors, "code")}>
        <TextInput
          maxLength={FIELD_LIMITS.code}
          placeholder="e.g. MAIN"
          {...register("code", { validate: requiredTrim(FORM_COPY.codeRequired) })}
        />
      </Field>
      <Field label="Type">
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <SelectInput
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
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
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <Field label="Address">
        <TextInput
          maxLength={FIELD_LIMITS.address}
          placeholder="e.g. Hall Road, Lahore"
          {...register("address")}
        />
      </Field>
      <Toggle checked={lotEnabled} onChange={() => undefined} label="Branch lot tracking" />
      <Toggle checked={negativeStock} onChange={() => undefined} label="Allow negative stock" />
    </form>
  );
}

export function ShopsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [settings, setSettings] = useState<BranchSetting[]>([]);
  const [open, setOpen] = useState<Branch | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await ensureSession(controller.signal);
      const rows = await listAllBranches(controller.signal).catch(() => []);
      setBranches(rows.map(mapBranch));
      setSettings(rows.map(mapBranchSetting).filter((s): s is BranchSetting => s !== null));
    })();
    return () => controller.abort();
  }, []);

  const setting = useMemo(() => {
    const map = new Map<string, BranchSetting>();
    settings.forEach((s) => map.set(s.branchId, s));
    return (id: string) => map.get(id);
  }, [settings]);

  return (
    <div className="ui-stack [display:grid] [gap:12px]">
      <PageHead title="Branches">
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setOpen(branches[0] ?? null)}
        >
          Add branch
        </Button>
      </PageHead>
      <p className="ui-note [font-size:12px] [color:var(--muted)] [line-height:1.45]">
        STORE sells. WAREHOUSE holds bulk lots. REPAIR and PRODUCTION consume components.
        BranchSetting controls lot tracking and negative stock per location.
      </p>
      <div className="ui-kpi-row [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:10px] [width:100%] [flex-shrink:0]">
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
          label="Lot tracking"
          value={settings.filter((s) => s.branchLotEnabled).length}
          hint="BranchLot rows"
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
            <Th>Lot tracking</Th>
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
        title={open?.name ?? "Branch"}
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form={SHOP_FORM_ID}>
              Save
            </Button>
          </>
        }
      >
        {open ? (
          <ShopEditForm
            key={open.id}
            branch={open}
            lotEnabled={Boolean(setting(open.id)?.branchLotEnabled)}
            negativeStock={Boolean(setting(open.id)?.allowNegativeStock)}
            onValid={() => setOpen(null)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
