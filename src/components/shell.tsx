"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CheckSquare,
  FileText,
  Home,
  IndianRupee,
  LogOut,
  Menu,
  MonitorPlay,
  Search,
  Settings,
  Target,
  X,
} from "lucide-react";
import { Avatar, cn } from "./ui";

const ICONS = {
  home: Home,
  tasks: CheckSquare,
  leads: Target,
  clients: Building2,
  quotes: FileText,
  screens: MonitorPlay,
  bookings: CalendarCheck,
  invoices: IndianRupee,
  reports: BarChart3,
  settings: Settings,
};

export type NavItem = { key: keyof typeof ICONS; href: string; label: string; badge?: number; group: string };

export function Shell({
  nav,
  user,
  logout,
  children,
}: {
  nav: NavItem[];
  user: { name: string; role: string };
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  const groups = [...new Set(nav.map((n) => n.group))];

  const sidebar = (
    <nav className="flex h-full flex-col bg-brand-900 text-brand-100">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-500 text-white">
          <MonitorPlay className="size-4.5" />
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-white">Reklama</p>
          <p className="text-[11px] text-brand-300">Outdoor & DOOH CRM</p>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g}>
            {g && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-brand-400 uppercase">{g}</p>}
            <ul className="space-y-0.5">
              {nav
                .filter((n) => n.group === g)
                .map((n) => {
                  const Icon = ICONS[n.key];
                  const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
                  return (
                    <li key={n.key}>
                      <Link
                        href={n.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active ? "bg-white/12 text-white" : "text-brand-200 hover:bg-white/6 hover:text-white",
                        )}
                      >
                        <Icon className={cn("size-[18px]", active ? "text-accent-500" : "text-brand-300")} />
                        <span className="flex-1">{n.label}</span>
                        {!!n.badge && (
                          <span className="rounded-full bg-accent-500 px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">
                            {n.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-brand-300">{user.role}</p>
          </div>
          <form action={logout}>
            <button type="submit" title="Sign out" className="rounded-md p-1.5 text-brand-300 hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</aside>
          <button onClick={() => setOpen(false)} className="absolute top-4 left-[19rem] rounded-full bg-white p-1.5 shadow" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <form action="/search" className="relative max-w-xl flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            placeholder="Search clients, screens, quotes, invoices…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </form>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
