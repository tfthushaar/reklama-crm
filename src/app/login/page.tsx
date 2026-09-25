import { redirect } from "next/navigation";
import { MonitorPlay, CalendarCheck, Receipt, Users } from "lucide-react";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { ActionButton, ActionForm } from "@/components/forms";
import { Avatar, Field, Input } from "@/components/ui";
import { demoLoginAction, loginAction } from "@/app/actions/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const db = await getDb();
  const demoUsers = await db.select().from(users).orderBy(users.id);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Reklama Global</span>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">Every lead, screen and rupee — in one place.</h1>
          <p className="mt-4 text-brand-200">
            Track conversations, quote screens in minutes, lock bookings without double-selling, and know exactly who owes what.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-100">
            {[
              [Users, "One timeline for every client — calls, WhatsApp, email, meetings"],
              [MonitorPlay, "Live availability for every LED and hoarding, by slot or exclusive"],
              [CalendarCheck, "Quotes turn into bookings in one click"],
              [Receipt, "GST invoices, TDS-aware payments and overdue alerts"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Users;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="rounded-lg bg-white/10 p-2">
                    <I className="size-4" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-xs text-brand-300">Prototype · sample data</p>
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full bg-brand-700/40 blur-3xl" />
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo />
            <span className="text-lg font-semibold">Reklama Global</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your work email and password.</p>

          <ActionForm action={loginAction} submitLabel="Sign in" className="mt-6" resetOnSuccess={false}>
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required placeholder="you@reklama.demo" />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
          </ActionForm>

          <div className="mt-10">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Demo — sign in as</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {demoUsers.map((u) => (
                <ActionButton
                  key={u.id}
                  action={demoLoginAction}
                  fields={{ email: u.email }}
                  variant="secondary"
                  size="lg"
                  full
                  className="w-full justify-start px-3"
                >
                  <Avatar name={u.name} size="sm" />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm font-medium text-slate-800">{u.name}</span>
                    <span className="text-xs font-normal text-slate-500">{ROLE_LABEL[u.role]}</span>
                  </span>
                </ActionButton>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">All demo passwords: demo123</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-lg bg-accent-500 text-white">
      <MonitorPlay className="size-5" />
    </span>
  );
}
