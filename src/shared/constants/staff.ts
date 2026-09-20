import type { ColumnOption } from "@/components/common/ColumnPicker";
import type { UserAccessRole } from "@/shared/domain/types";

/** Public Vite env only — never put signing secrets here. Prefer requiring a password in the UI. */
export const DEFAULT_STAFF_PASSWORD = String(import.meta.env.VITE_DEFAULT_STAFF_PASSWORD ?? "");

export const STAFF_TAB_EMPLOYEES = "employees";
export const STAFF_TAB_LEDGER = "ledger";

export const EMPLOYEE_TABS = [
  { id: STAFF_TAB_EMPLOYEES, label: "Employees" },
  { id: STAFF_TAB_LEDGER, label: "Staff ledger" },
] as const;

export const STAFF_STATUS_ACTIVE = "Active";
export const STAFF_STATUS_INACTIVE = "Inactive";

export const STAFF_ROLE_OWNER = "OWNER";
export const STAFF_ROLE_MANAGER = "MANAGER";
export const STAFF_ROLE_CASHIER = "CASHIER";
export const STAFF_ROLE_TECHNICIAN = "TECHNICIAN";
export const STAFF_ROLE_PARTNER = "PARTNER";

export const USER_ACCESS_ROLES: UserAccessRole[] = ["OWNER", "MANAGER", "CASHIER"];

/** Payroll staff roles stored on the user record (excludes OWNER). */
export const STAFF_EMPLOYEE_ROLES = [
  STAFF_ROLE_MANAGER,
  STAFF_ROLE_CASHIER,
  STAFF_ROLE_TECHNICIAN,
  STAFF_ROLE_PARTNER,
] as const;

export const EMPLOYEE_TABLE_COLUMNS: ColumnOption[] = [
  { id: "name", label: "Name" },
  { id: "phone", label: "Phone" },
  { id: "role", label: "Employee role" },
  { id: "branch", label: "Branch" },
  { id: "city", label: "City" },
  { id: "paid", label: "Total paid" },
];

export const USER_TABLE_COLUMNS: ColumnOption[] = [
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "role", label: "User role" },
  { id: "branch", label: "Branch" },
  { id: "city", label: "City" },
];

export const STAFF_LEDGER_COLUMNS: ColumnOption[] = [
  { id: "occurredAt", label: "When" },
  { id: "user", label: "Staff" },
  { id: "type", label: "Type" },
  { id: "debit", label: "Paid" },
  { id: "balance", label: "Total paid" },
  { id: "notes", label: "Notes" },
];

export const STAFF_LEDGER_TYPES = ["SALARY", "COMMISSION"] as const;

export const EMPLOYEE_SEARCH_PLACEHOLDER = "Search by name or phone";
export const USER_SEARCH_PLACEHOLDER = "Search by name, email, or phone";
export const STAFF_LEDGER_SEARCH_PLACEHOLDER = "Search ledger by staff, type, or notes";

export const USERS_COPY = {
  title: "Users",
  pageSubtitle: "Sign-in accounts, roles, and permissions",
  add: "Add user",
  saved: "User saved",
  updated: "User updated",
  saveFailed: "Could not save user",
  detailTitle: "User details",
  detailSubtitle: "Sign-in account, role, and access.",
  detailReferenceLabel: "User ID",
  contactSection: "Account information",
  statusActiveHint: "Can sign in",
  statusInactiveHint: "Sign-in blocked",
  noPhoneHint: "No phone added",
  editUserAction: "Update account",
  activeKpiHint: "Can sign in",
  ownersKpiHint: "Full access",
  passwordHint: "Password is stored when auth is enabled",
  changePassword: "Change password",
  resetPassword: "Reset password",
  passwordSaved: "Password updated",
  permissionsTitle: "Permissions",
  permissionsHint: "Prefilled by role — adjust per module",
  removed: "User removed",
  removeFailed: "Could not remove user",
} as const;

export const EMPLOYEE_COPY = {
  title: "Employees",
  pageSubtitle: "Payroll staff and payouts. Sign-in accounts are under Users.",
  add: "Add employee",
  saved: "Employee saved",
  updated: "Employee updated",
  saveFailed: "Could not save employee",
  removed: "Employee removed",
  removeFailed: "Could not remove employee",
  payTitle: "Record payout",
  paySalary: "Pay salary",
  paySaved: "Payout recorded",
  payFailed: "Could not record payout",
  payHint: "Cash leaves the shop for salary or commission",
  ledgerTotals: "Totals (filtered)",
  ledgerEmpty: "No data found",
  detailTitle: "Employee details",
  detailSubtitle: "Payroll staff and payout history.",
  detailReferenceLabel: "Employee ID",
  contactSection: "Employee information",
  statusActiveHint: "On payroll",
  statusInactiveHint: "Not on payroll",
  noPhoneHint: "No phone added",
  payEmployeeAction: "Record salary or commission",
  viewLedgerAction: "See all payouts",
  editEmployeeAction: "Update information",
  viewLedger: "View full ledger",
  totalPaid: "Total paid",
  paidThisMonth: "Paid this month",
  activeKpiHint: "On payroll",
  totalPaidKpiHint: "Filter-aware payouts",
  joiningDate: "Joining date",
  salaryWage: "Salary/wage",
  notes: "Notes",
} as const;

export const STAFF_LEDGER_FILTER_FIELDS: {
  id: string;
  label: string;
  options?: string[];
  placeholder?: string;
  numeric?: boolean;
}[] = [
  { id: "user", label: "Staff" },
  { id: "entryType", label: "Type", options: [...STAFF_LEDGER_TYPES] },
  { id: "debit", label: "Minimum paid", placeholder: "Minimum amount", numeric: true },
  { id: "notes", label: "Notes" },
];

export const STAFF_PAYOUT_PROFIT = "PROFIT";
export const STAFF_PAYOUT_REVENUE = "REVENUE";

export const STAFF_ADJUST_ROLES = new Set(["OWNER", "MANAGER"]);

export function staffCanManage(role?: string | null) {
  return Boolean(role && STAFF_ADJUST_ROLES.has(role));
}

export function staffCanViewUsers(role?: string | null) {
  return staffCanManage(role);
}

export function staffLedgerTypeLabel(type: string) {
  if (type === "SALARY") return "Salary";
  if (type === "COMMISSION") return "Commission";
  return type.replace(/_/g, " ");
}

export function employeeRoleLabel(role: string) {
  return staffRoleLabel(role);
}

export function userAccessRoleLabel(role: UserAccessRole | string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function staffRoleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export type PermissionDef = { key: string; label: string };

export type PermissionGroupDef = {
  id: string;
  label: string;
  permissions: PermissionDef[];
};

export const USER_PERMISSION_GROUPS: PermissionGroupDef[] = [
  { id: "dashboard", label: "Dashboard", permissions: [{ key: "dashboard.view", label: "View" }] },
  {
    id: "sales",
    label: "Sales",
    permissions: [
      { key: "sales.view", label: "View" },
      { key: "sales.create", label: "Create" },
      { key: "sales.edit", label: "Edit" },
      { key: "sales.return_void", label: "Return/Void" },
    ],
  },
  {
    id: "products",
    label: "Products",
    permissions: [
      { key: "products.view", label: "View" },
      { key: "products.add", label: "Add" },
      { key: "products.edit", label: "Edit" },
      { key: "products.adjust_stock", label: "Adjust stock" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    permissions: [
      { key: "customers.view", label: "View" },
      { key: "customers.add", label: "Add" },
      { key: "customers.edit", label: "Edit" },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    permissions: [
      { key: "suppliers.view", label: "View" },
      { key: "suppliers.add", label: "Add" },
      { key: "suppliers.edit", label: "Edit" },
    ],
  },
  {
    id: "employees",
    label: "Employees",
    permissions: [
      { key: "employees.view", label: "View" },
      { key: "employees.add", label: "Add" },
      { key: "employees.edit", label: "Edit" },
      { key: "employees.view_payments", label: "View payments" },
    ],
  },
  {
    id: "expenses",
    label: "Expenses",
    permissions: [
      { key: "expenses.view", label: "View" },
      { key: "expenses.add", label: "Add" },
      { key: "expenses.edit", label: "Edit" },
    ],
  },
  { id: "reports", label: "Reports", permissions: [{ key: "reports.view", label: "View" }] },
  {
    id: "users",
    label: "Users",
    permissions: [
      { key: "users.view", label: "View" },
      { key: "users.add", label: "Add" },
      { key: "users.edit", label: "Edit" },
      { key: "users.manage_permissions", label: "Manage permissions" },
    ],
  },
  { id: "settings", label: "Settings", permissions: [{ key: "settings.access", label: "Access" }] },
];

export const ALL_PERMISSION_KEYS = USER_PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((perm) => perm.key),
);

export function defaultPermissionsForRole(role: UserAccessRole): Record<string, boolean> {
  const all = Object.fromEntries(ALL_PERMISSION_KEYS.map((key) => [key, false])) as Record<
    string,
    boolean
  >;

  if (role === "OWNER") {
    ALL_PERMISSION_KEYS.forEach((key) => {
      all[key] = true;
    });
    return all;
  }

  if (role === "MANAGER") {
    [
      "dashboard.view",
      "sales.view",
      "sales.create",
      "sales.edit",
      "sales.return_void",
      "products.view",
      "products.add",
      "products.edit",
      "products.adjust_stock",
      "customers.view",
      "customers.add",
      "customers.edit",
      "suppliers.view",
      "suppliers.add",
      "suppliers.edit",
      "employees.view",
      "employees.add",
      "employees.edit",
      "employees.view_payments",
      "expenses.view",
      "expenses.add",
      "expenses.edit",
      "reports.view",
      "users.view",
      "settings.access",
    ].forEach((key) => {
      all[key] = true;
    });
    return all;
  }

  [
    "dashboard.view",
    "sales.view",
    "sales.create",
    "products.view",
    "customers.view",
    "customers.add",
  ].forEach((key) => {
    all[key] = true;
  });
  return all;
}

export const STAFF_USERS_FILTER_FIELDS: { id: string; label: string; options?: string[] }[] = [
  { id: "role", label: "User role", options: [...USER_ACCESS_ROLES] },
  { id: "status", label: "Status", options: [STAFF_STATUS_ACTIVE, STAFF_STATUS_INACTIVE] },
];

export const STAFF_EMPLOYEES_FILTER_FIELDS: { id: string; label: string; options?: string[] }[] = [
  { id: "role", label: "Employee role", options: [...STAFF_EMPLOYEE_ROLES] },
  { id: "status", label: "Status", options: [STAFF_STATUS_ACTIVE, STAFF_STATUS_INACTIVE] },
];

export function employeeFilterFields(branchNames: string[]) {
  return [
    { id: "role", label: "Employee role", options: [...STAFF_EMPLOYEE_ROLES] },
    { id: "branch", label: "Branch", options: branchNames, searchable: true },
    { id: "status", label: "Status", options: [STAFF_STATUS_ACTIVE, STAFF_STATUS_INACTIVE] },
  ];
}

export function userFilterFields(branchNames: string[]) {
  return [
    { id: "role", label: "User role", options: [...USER_ACCESS_ROLES] },
    { id: "branch", label: "Branch", options: branchNames, searchable: true },
    { id: "status", label: "Status", options: [STAFF_STATUS_ACTIVE, STAFF_STATUS_INACTIVE] },
  ];
}
