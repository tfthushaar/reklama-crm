"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Plus,
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
type Command = { label: string; hint?: string; href: string; icon: typeof Home };

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-lg bg-neutral-900 text-[13px] font-semibold text-white">R</span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">Reklama</span>
    </span>
  );
}

export function Shell({
  nav,
  user,
  logout,
  canCreate,
  children,
}: {
  nav: NavItem[];
  user: { name: string; role: string };
  logout: () => Promise<void>;
  canCreate: { lead: boolean; quote: boolean; screen: boolean };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      ...(canCreate.quote ? [{ label: "New quote", href: "/quotes/new", icon: Plus }] : []),
      ...(canCreate.lead ? [{ label: "Add a lead", href: "/clients/new", icon: Plus }] : []),
      ...(canCreate.screen ? [{ label: "Add a screen", href: "/screens/new", icon: Plus }] : []),
      ...nav.map((n) => ({ label: n.label, href: n.href, icon: ICONS[n.key], hint: "Go to" })),
      ...(nav.some((n) => n.key === "screens") ? [{ label: "Availability calendar", href: "/screens/availability", icon: MonitorPlay, hint: "Go to" }] : []),
    ],
    [nav, canCreate],
  );

  const groups = [...new Set(nav.map((n) => n.group))];

  const sidebar = (
    <nav className="flex h-full flex-col bg-white">
      <div className="px-5 pt-6 pb-4">
        <Link href="/">
          <Wordmark />
        </Link>
      </div>
      <div className="px-3 pb-2">
        <button
          onClick={() => setPalette(true)}
          className="flex h-9 w-full items-center gap-2 rounded-xl bg-neutral-100 px-3 text-left text-[13px] text-neutral-500 transition-colors hover:bg-neutral-200/70"
        >
          <Search className="size-4 stroke-[1.75]" />
          <span className="flex-1">Search</span>
          <kbd className="rounded-md bg-white px-1.5 py-0.5 font-sans text-[11px] text-neutral-500 ring-1 ring-neutral-200">Ctrl K</kbd>
        </button>
      </div>
      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g}>
            {g && <p className="mb-1 px-3 text-xs text-neutral-400">{g}</p>}
            <ul className="space-y-px">
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
                          "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                          active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                        )}
                      >
                        <Icon className={cn("size-[18px] stroke-[1.75]", active ? "text-neutral-900" : "text-neutral-400")} />
                        <span className="flex-1">{n.label}</span>
                        {!!n.badge && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-[11px] font-medium text-white tabular-nums">
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
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium text-neutral-900">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">{user.role}</p>
          </div>
          <form action={logout}>
            <button type="submit" title="Sign out" className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900">
              <LogOut className="size-4 stroke-[1.75]" />
            </button>
          </form>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">{sidebar}</aside>
          <button onClick={() => setOpen(false)} className="absolute top-5 left-[19rem] rounded-full bg-white p-2" aria-label="Close menu">
            <X className="size-5 stroke-[1.75]" />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} className="-ml-2 rounded-lg p-2 text-neutral-700" aria-label="Open menu">
          <Menu className="size-5 stroke-[1.75]" />
        </button>
        <Wordmark />
        <button onClick={() => setPalette(true)} className="-mr-2 rounded-lg p-2 text-neutral-700" aria-label="Search">
          <Search className="size-5 stroke-[1.75]" />
        </button>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
      {palette && <CommandMenu commands={commands} onClose={() => setPalette(false)} />}
    </div>
  );
}

function CommandMenu({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const query = q.trim().toLowerCase();
  const matches = commands.filter((c) => !query || c.label.toLowerCase().includes(query));
  const items: Command[] = [...(query.length >= 2 ? [{ label: `Search for “${q.trim()}”`, href: `/search?q=${encodeURIComponent(q.trim())}`, icon: Search }] : []), ...matches];

  function go(c: Command | undefined) {
    if (!c) return;
    onClose();
    router.push(c.href);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/25 px-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 stroke-[1.75] text-neutral-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(items.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter") go(items[index]);
            }}
            placeholder="Search clients, screens, quotes, invoices — or jump to a page"
            className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-400"
          />
        </div>
        <ul className="scrollbar-thin max-h-80 overflow-y-auto p-2">
          {items.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.href + c.label}>
                <button
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(c)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm", i === index ? "bg-neutral-100 text-neutral-900" : "text-neutral-700")}
                >
                  <Icon className="size-4 stroke-[1.75] text-neutral-400" />
                  <span className="flex-1">{c.label}</span>
                  {c.hint && <span className="text-xs text-neutral-400">{c.hint}</span>}
                </button>
              </li>
            );
          })}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-neutral-500">Type at least two letters to search.</li>}
        </ul>
      </div>
    </div>
  );
}
