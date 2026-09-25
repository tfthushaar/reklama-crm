import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { quotes, tasks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { addDays, istDateTime, today } from "@/lib/format";
import { can, navFor, type NavKey } from "@/lib/permissions";
import { runHousekeeping } from "@/lib/services/housekeeping";
import { Shell, type NavItem } from "@/components/shell";
import { logoutAction } from "@/app/actions/auth";

const NAV: Record<NavKey, Omit<NavItem, "badge">> = {
  home: { key: "home", href: "/", label: "Home", group: "" },
  tasks: { key: "tasks", href: "/tasks", label: "My tasks", group: "" },
  leads: { key: "leads", href: "/leads", label: "Leads", group: "Sales" },
  clients: { key: "clients", href: "/clients", label: "Clients", group: "Sales" },
  quotes: { key: "quotes", href: "/quotes", label: "Quotes", group: "Sales" },
  screens: { key: "screens", href: "/screens", label: "Screens", group: "Operations" },
  bookings: { key: "bookings", href: "/bookings", label: "Bookings", group: "Operations" },
  invoices: { key: "invoices", href: "/invoices", label: "Invoices & payments", group: "Money" },
  reports: { key: "reports", href: "/reports", label: "Reports", group: "Money" },
  settings: { key: "settings", href: "/settings", label: "Settings", group: "Admin" },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  await runHousekeeping(db);

  const endOfToday = istDateTime(addDays(today(), 1), "00:00");
  const [{ due }] = await db
    .select({ due: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.assignedTo, user.id), eq(tasks.status, "open"), lte(tasks.dueAt, endOfToday)));
  let approvals = 0;
  if (can(user, "approve")) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(quotes).where(eq(quotes.status, "pending_approval"));
    approvals = r?.n ?? 0;
  }

  const nav: NavItem[] = navFor(user.role).map((k) => ({
    ...NAV[k],
    badge: k === "tasks" ? due : k === "quotes" ? approvals : undefined,
  }));

  return (
    <Shell nav={nav} user={{ name: user.name, role: ROLE_LABEL[user.role] }} logout={logoutAction}>
      {children}
    </Shell>
  );
}
