import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  CircleDot,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyRow,
  EntityCell,
  EntityDetailDrawer,
  HubChart,
  HubChartGrid,
  KpiCard,
  Menu,
  MenuItem,
  PageHead,
  Pagination,
  Table,
  TableRowsSkeleton,
  Td,
  THead,
  Th,
  toaster,
} from "@/components/common";
import type { FilterChip } from "@/components/common/FilterPicker";
import { HubToolbar, type HubView } from "@/pages/products/HubToolbar";
import { UserForm, USER_FORM_ID, type UserFormValues } from "@/pages/users/UserForm";
import type { Branch, StaffUser } from "@/shared/domain/types";
import { formatPkMobile } from "@/utils/phone";
import { ensureSession } from "@/services/auth";
import {
  createUser,
  deleteUser,
  listAllBranches,
  listAllUsers,
  listUsers,
  mapBranch,
  mapUser,
  updateUser,
  type UserRequestPayload,
} from "@/services/org";
import { DEFAULT_PAGE_SIZE } from "@/shared/constants/config";
import { listEmptyMessage } from "@/shared/constants/empty";
import { routes } from "@/shared/constants/routes";
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_STAFF_PASSWORD,
  STAFF_ROLE_OWNER,
  STAFF_STATUS_ACTIVE,
  STAFF_STATUS_INACTIVE,
  USER_ACCESS_ROLES,
  USER_SEARCH_PLACEHOLDER,
  USER_TABLE_COLUMNS,
  USERS_COPY,
  defaultPermissionsForRole,
  staffCanViewUsers,
  userAccessRoleLabel,
  userFilterFields,
} from "@/shared/constants/staff";
import { createLoadGuard, isAbortError } from "@/utils/async";
import { formatEntityRef, shortError } from "@/utils/format";

const PAGE = DEFAULT_PAGE_SIZE;

function chipValue(chips: FilterChip[], field: string) {
  return chips.find((chip) => chip.field === field)?.value ?? "";
}

function deriveUsername(email: string) {
  const local = email.trim().split("@")[0]?.trim();
  return local || "user";
}

function roleFromChip(value: string) {
  if (!value) return undefined;
  const direct = USER_ACCESS_ROLES.find((role) => role === value);
  if (direct) return direct;
  return USER_ACCESS_ROLES.find((role) => userAccessRoleLabel(role) === value);
}

function userQuery(search: string, chips: FilterChip[]) {
  const status = chipValue(chips, "status");
  return {
    search: search.trim() || undefined,
    role: roleFromChip(chipValue(chips, "role")),
    isActive:
      status === STAFF_STATUS_ACTIVE ? true : status === STAFF_STATUS_INACTIVE ? false : undefined,
  };
}

function permissionsPayload(permissions: Record<string, boolean>) {
  return ALL_PERMISSION_KEYS.map((permissionKey) => ({
    permissionKey,
    isAllowed: Boolean(permissions[permissionKey]),
  }));
}

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), pages, total: rows.length, page: safePage };
}

const blankUser = (branches: Branch[]): StaffUser => ({
  id: "",
  name: "",
  phone: "",
  email: "",
  username: "",
  role: "CASHIER",
  branchId: branches[0]?.id ?? "",
  isActive: true,
  totalPaid: 0,
  permissions: defaultPermissionsForRole("CASHIER"),
});

export function UsersPage() {
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<StaffUser[]>([]);
  const [chartRows, setChartRows] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [counts, setCounts] = useState({ all: 0, active: 0, owners: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [cols, setCols] = useState(USER_TABLE_COLUMNS.map((col) => col.id));
  const [view, setView] = useState<HubView>("table");
  const [edit, setEdit] = useState<StaffUser | null>(null);
  const [detail, setDetail] = useState<StaffUser | null>(null);
  const [remove, setRemove] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState({ fetching: true, saving: false, deleting: false });

  const canViewUsers = staffCanViewUsers(viewerRole);
  const apiFilters = useMemo(() => userQuery(search, chips), [chips, search]);
  const branchFilterId = useMemo(() => {
    const name = chipValue(chips, "branch");
    if (!name) return undefined;
    return branches.find((branch) => branch.name === name)?.id;
  }, [branches, chips]);
  const useClientBranch = Boolean(branchFilterId);

  const filterFields = useMemo(
    () =>
      userFilterFields(branches.map((branch) => branch.name)).map((field) =>
        field.id === "role"
          ? { ...field, options: USER_ACCESS_ROLES.map((role) => userAccessRoleLabel(role)) }
          : field,
      ),
    [branches],
  );

  useEffect(() => {
    const controller = new AbortController();
    void ensureSession(controller.signal)
      .then((session) => setViewerRole(session?.user.role ?? null))
      .catch(() => setViewerRole(null));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void listAllBranches(controller.signal)
      .then((response) => setBranches(response.map(mapBranch)))
      .catch((error) => {
        if (isAbortError(error)) return;
        setBranches([]);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const guard = createLoadGuard();
    setLoading((current) => ({ ...current, fetching: true }));

    const load = async () => {
      try {
        if (useClientBranch) {
          const all = await listAllUsers(apiFilters, controller.signal);
          const filtered = all.map(mapUser).filter((row) => row.branchId === branchFilterId);
          const userPage = paginate(filtered, page, pageSize);
          if (!guard.isActive()) return;
          setRows(userPage.rows);
          setTotal(userPage.total);
          setPages(userPage.pages);
          setChartRows(filtered);
        } else {
          const response = await listUsers(
            { ...apiFilters, page, perPage: pageSize },
            controller.signal,
          );
          if (!guard.isActive()) return;
          setRows(response.data.map(mapUser));
          setTotal(response.meta.totalItems);
          setPages(Math.max(1, response.meta.totalPages));
        }
      } catch (error) {
        if (isAbortError(error)) return;
        if (!guard.isActive()) return;
        setRows([]);
        setTotal(0);
        setPages(1);
      } finally {
        if (guard.isActive()) {
          setLoading((current) => ({ ...current, fetching: false }));
        }
      }
    };

    void load();
    return () => {
      guard.dispose();
      controller.abort();
    };
  }, [apiFilters, branchFilterId, page, pageSize, reloadKey, useClientBranch]);

  useEffect(() => {
    if (useClientBranch) return;
    const controller = new AbortController();
    void listAllUsers(apiFilters, controller.signal)
      .then((response) => setChartRows(response.map(mapUser)))
      .catch((error) => {
        if (isAbortError(error)) return;
        setChartRows([]);
      });
    return () => controller.abort();
  }, [apiFilters, reloadKey, useClientBranch]);

  useEffect(() => {
    const controller = new AbortController();
    if (useClientBranch) {
      void listAllUsers(apiFilters, controller.signal)
        .then((response) => {
          const filtered = response.map(mapUser).filter((row) => row.branchId === branchFilterId);
          setCounts({
            all: filtered.length,
            active: filtered.filter((row) => row.isActive).length,
            owners: filtered.filter((row) => row.role === STAFF_ROLE_OWNER).length,
          });
        })
        .catch((error) => {
          if (isAbortError(error)) return;
          setCounts({ all: 0, active: 0, owners: 0 });
        });
      return () => controller.abort();
    }

    void Promise.all([
      listUsers({ ...apiFilters, page: 1, perPage: 1 }, controller.signal),
      listUsers({ ...apiFilters, page: 1, perPage: 1, isActive: true }, controller.signal),
      listUsers({ ...apiFilters, page: 1, perPage: 1, role: STAFF_ROLE_OWNER }, controller.signal),
    ])
      .then(([all, active, owners]) => {
        setCounts({
          all: all.meta.totalItems,
          active: active.meta.totalItems,
          owners: owners.meta.totalItems,
        });
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setCounts({ all: 0, active: 0, owners: 0 });
      });
    return () => controller.abort();
  }, [apiFilters, branchFilterId, reloadKey, useClientBranch]);

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name ?? "—";
  const isNew = Boolean(edit && !edit.id);
  const show = (id: string) => cols.includes(id);
  const hasFilters = Boolean(search || chips.length);
  const safePage = Math.min(page, pages);

  function openCreate() {
    setEdit(blankUser(branches));
  }

  async function saveUser(values: UserFormValues) {
    if (!edit) return;
    setLoading((current) => ({ ...current, saving: true }));
    try {
      const payload: UserRequestPayload = {
        name: values.name.trim(),
        phone: values.phone.replace(/\D/g, ""),
        email: values.email.trim(),
        role: values.role,
        defaultBranchId: values.branchId,
        isActive: values.isActive,
        permissions: permissionsPayload(values.permissions),
      };

      if (isNew) {
        payload.username = deriveUsername(values.email);
        payload.password = values.password.trim() || DEFAULT_STAFF_PASSWORD;
        await createUser(payload);
      } else {
        payload.username = edit.username;
        if (values.password.trim()) payload.password = values.password.trim();
        await updateUser(edit.id, payload);
      }

      setReloadKey((key) => key + 1);
      setEdit(null);
      setPage(1);
      toaster.success(
        isNew
          ? USERS_COPY.saved
          : values.password.trim()
            ? USERS_COPY.passwordSaved
            : USERS_COPY.updated,
      );
    } catch (error) {
      toaster.error(shortError(error, USERS_COPY.saveFailed));
      throw error;
    } finally {
      setLoading((current) => ({ ...current, saving: false }));
    }
  }

  function confirmDelete() {
    if (!remove || remove.role === STAFF_ROLE_OWNER) return;
    setLoading((current) => ({ ...current, deleting: true }));
    void deleteUser(remove.id)
      .then(() => {
        setReloadKey((key) => key + 1);
        if (detail?.id === remove.id) setDetail(null);
        toaster.success(USERS_COPY.removed);
      })
      .catch((error) => toaster.error(shortError(error, USERS_COPY.removeFailed)))
      .finally(() => {
        setLoading((current) => ({ ...current, deleting: false }));
        setRemove(null);
      });
  }

  const roleChart = USER_ACCESS_ROLES.map((role) => ({
    id: role,
    label: userAccessRoleLabel(role),
    value: chartRows.filter((row) => row.role === role).length,
  })).filter((point) => point.value > 0);

  if (viewerRole && !canViewUsers) {
    return <Navigate to={routes.employees} replace />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <PageHead
        title={USERS_COPY.title}
        subtitle={USERS_COPY.pageSubtitle}
        icon={<UserRound size={17} />}
      >
        <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
          {USERS_COPY.add}
        </Button>
      </PageHead>

      <div className="ui-kpi-row grid shrink-0 grid-cols-4 gap-2.5">
        <KpiCard
          label="All users"
          value={counts.all}
          hint="Matching filters"
          tone="info"
          icon={<UserRound size={16} />}
        />
        <KpiCard label="Active" value={counts.active} hint={USERS_COPY.activeKpiHint} tone="ok" />
        <KpiCard
          label="Owners"
          value={counts.owners}
          hint={USERS_COPY.ownersKpiHint}
          tone="phantom"
        />
        <KpiCard
          label="Inactive"
          value={counts.all - counts.active}
          hint="Blocked sign-in"
          tone="stale"
        />
      </div>

      <Table
        toolbar={
          <HubToolbar
            columns={USER_TABLE_COLUMNS}
            cols={cols}
            onCols={setCols}
            chips={chips}
            onApply={(chip) => {
              setChips((current) => [...current.filter((item) => item.field !== chip.field), chip]);
              setPage(1);
            }}
            onRemove={(field) => {
              setChips((current) => current.filter((chip) => chip.field !== field));
              setPage(1);
            }}
            onClear={() => {
              setChips([]);
              setPage(1);
            }}
            filterFields={filterFields}
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder={USER_SEARCH_PLACEHOLDER}
            view={view}
            onView={setView}
          />
        }
        body={
          view === "insights" ? (
            <HubChartGrid>
              <HubChart type="donut" title="Users by role" data={roleChart} />
            </HubChartGrid>
          ) : undefined
        }
        footer={
          <Pagination
            page={safePage}
            pages={pages}
            total={total}
            pageSize={pageSize}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            onChange={setPage}
          />
        }
      >
        {view === "table" ? (
          <>
            <THead>
              <tr>
                {show("name") ? <Th>Name</Th> : null}
                {show("email") ? <Th>Email</Th> : null}
                {show("phone") ? <Th>Phone</Th> : null}
                {show("role") ? <Th>User role</Th> : null}
                {show("branch") ? <Th>Branch</Th> : null}
                {show("status") ? <Th>Status</Th> : null}
                <Th />
              </tr>
            </THead>
            <tbody>
              {loading.fetching ? (
                <TableRowsSkeleton columnCount={cols.length} rows={6} hasActions />
              ) : null}
              {!loading.fetching && rows.length === 0 ? (
                <EmptyRow cols={cols.length + 1} text={listEmptyMessage(hasFilters)} />
              ) : null}
              {!loading.fetching
                ? rows.map((row) => (
                    <tr key={row.id} className="cursor-pointer" onClick={() => setDetail(row)}>
                      {show("name") ? (
                        <Td>
                          <EntityCell title={row.name} subtitle={`@${row.username}`} tone="blue" />
                        </Td>
                      ) : null}
                      {show("email") ? <Td>{row.email || "—"}</Td> : null}
                      {show("phone") ? (
                        <Td>{row.phone ? formatPkMobile(row.phone) : "—"}</Td>
                      ) : null}
                      {show("role") ? (
                        <Td>
                          <Badge tone={row.role === STAFF_ROLE_OWNER ? "ok" : "info"}>
                            {userAccessRoleLabel(row.role)}
                          </Badge>
                        </Td>
                      ) : null}
                      {show("branch") ? <Td>{branchName(row.branchId)}</Td> : null}
                      {show("status") ? (
                        <Td>
                          <Badge tone={row.isActive ? "ok" : "danger"}>
                            {row.isActive ? STAFF_STATUS_ACTIVE : STAFF_STATUS_INACTIVE}
                          </Badge>
                        </Td>
                      ) : null}
                      <Td>
                        <div onClick={(event) => event.stopPropagation()}>
                          <Menu>
                            <MenuItem icon={<Pencil size={14} />} onClick={() => setEdit(row)}>
                              Edit
                            </MenuItem>
                            {row.role !== STAFF_ROLE_OWNER ? (
                              <MenuItem
                                danger
                                icon={<Trash2 size={14} />}
                                onClick={() => setRemove(row)}
                              >
                                Delete
                              </MenuItem>
                            ) : null}
                          </Menu>
                        </div>
                      </Td>
                    </tr>
                  ))
                : null}
            </tbody>
          </>
        ) : null}
      </Table>

      {detail ? (
        <EntityDetailDrawer
          open
          title={USERS_COPY.detailTitle}
          subtitle={USERS_COPY.detailSubtitle}
          onClose={() => setDetail(null)}
          identity={{
            name: detail.name,
            reference: formatEntityRef("USR", detail.id),
            referenceLabel: USERS_COPY.detailReferenceLabel,
            badge: (
              <Badge tone={detail.isActive ? "ok" : "danger"}>
                {detail.isActive ? STAFF_STATUS_ACTIVE : STAFF_STATUS_INACTIVE}
              </Badge>
            ),
            icon: <UserRound size={18} />,
            tone: "violet",
          }}
          summaries={[
            {
              label: "User role",
              value: userAccessRoleLabel(detail.role),
              tone: detail.role === STAFF_ROLE_OWNER ? "ok" : "neutral",
              icon: <Shield size={15} />,
            },
            {
              label: "Status",
              value: detail.isActive ? STAFF_STATUS_ACTIVE : STAFF_STATUS_INACTIVE,
              hint: detail.isActive ? USERS_COPY.statusActiveHint : USERS_COPY.statusInactiveHint,
              tone: detail.isActive ? "ok" : "danger",
              icon: <CircleDot size={15} />,
            },
          ]}
          fieldsSectionTitle={USERS_COPY.contactSection}
          onEditFields={() => {
            setDetail(null);
            setEdit(detail);
          }}
          fields={[
            { label: "Name", value: detail.name, icon: <UserRound size={14} /> },
            { label: "Email", value: detail.email || "—", icon: <Mail size={14} /> },
            {
              label: "Phone",
              value: detail.phone ? formatPkMobile(detail.phone) : "—",
              icon: <Phone size={14} />,
              emptyHint: USERS_COPY.noPhoneHint,
            },
            {
              label: "User role",
              value: userAccessRoleLabel(detail.role),
              icon: <Shield size={14} />,
            },
            { label: "Branch", value: branchName(detail.branchId), icon: <MapPin size={14} /> },
          ]}
          actions={[
            {
              label: "Edit user",
              description: USERS_COPY.editUserAction,
              icon: <Pencil size={15} />,
              tone: "accent" as const,
              onClick: () => {
                setDetail(null);
                setEdit(detail);
              },
            },
            ...(detail.role !== STAFF_ROLE_OWNER
              ? [
                  {
                    label: "Delete",
                    description: "Remove sign-in access",
                    icon: <Trash2 size={15} />,
                    tone: "danger" as const,
                    onClick: () => setRemove(detail),
                  },
                ]
              : []),
          ]}
        />
      ) : null}

      <Drawer
        open={Boolean(edit)}
        title={isNew ? USERS_COPY.add : "Edit user"}
        onClose={() => setEdit(null)}
        size="lg"
        footer={
          <>
            <Button onClick={() => setEdit(null)} disabled={loading.saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={USER_FORM_ID} disabled={loading.saving}>
              {loading.saving ? "Saving…" : isNew ? USERS_COPY.add : "Save changes"}
            </Button>
          </>
        }
      >
        {edit ? (
          <UserForm
            key={edit.id || "new"}
            user={edit}
            branches={branches}
            isNew={isNew}
            onValid={saveUser}
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(remove)}
        title="Delete user?"
        body="Removes sign-in access. This cannot be undone."
        onCancel={() => setRemove(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
