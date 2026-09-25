import type { Role, Settings } from "@/db/schema";

export type Perm =
  | "sales"
  | "approve"
  | "assign"
  | "inventory"
  | "operations"
  | "finance"
  | "admin"
  | "team";

const MATRIX: Record<Perm, Role[]> = {
  sales: ["owner", "sales_manager", "sales_exec"],
  approve: ["owner", "sales_manager"],
  assign: ["owner", "sales_manager"],
  inventory: ["owner", "operations", "sales_manager"],
  operations: ["owner", "operations", "sales_manager"],
  finance: ["owner", "accounts"],
  admin: ["owner"],
  team: ["owner", "sales_manager"],
};

export function can(user: { role: Role } | null | undefined, perm: Perm): boolean {
  return !!user && MATRIX[perm].includes(user.role);
}

export function discountLimit(role: Role, settings: Pick<Settings, "execDiscountLimit" | "managerDiscountLimit">) {
  if (role === "owner") return 100;
  if (role === "sales_manager") return settings.managerDiscountLimit;
  return settings.execDiscountLimit;
}

export type NavKey =
  | "home"
  | "tasks"
  | "leads"
  | "clients"
  | "quotes"
  | "screens"
  | "bookings"
  | "invoices"
  | "reports"
  | "settings";

const NAV_BY_ROLE: Record<Role, NavKey[]> = {
  owner: ["home", "tasks", "leads", "clients", "quotes", "screens", "bookings", "invoices", "reports", "settings"],
  sales_manager: ["home", "tasks", "leads", "clients", "quotes", "screens", "bookings", "invoices", "reports"],
  sales_exec: ["home", "tasks", "leads", "clients", "quotes", "screens", "bookings"],
  operations: ["home", "tasks", "screens", "bookings", "clients"],
  accounts: ["home", "tasks", "invoices", "bookings", "clients", "reports"],
};

export function navFor(role: Role): NavKey[] {
  return NAV_BY_ROLE[role];
}
