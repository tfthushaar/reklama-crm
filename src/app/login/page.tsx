import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { ActionButton, ActionForm } from "@/components/forms";
import { Wordmark } from "@/components/shell";
import { Avatar, Field, Input } from "@/components/ui";
import { demoLoginAction, loginAction } from "@/app/actions/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const db = await getDb();
  const demoUsers = await db.select().from(users).orderBy(users.id);

  return (
    <div className="flex min-h-screen flex-col items-center px-5 py-16 sm:justify-center">
      <div className="w-full max-w-[380px]">
        <Wordmark />
        <h1 className="mt-12 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-neutral-900">Sign in</h1>
        <p className="mt-2 text-[15px] text-neutral-500">Leads, screens, quotes and billing for Reklama Global, in one place.</p>

        <ActionForm action={loginAction} submitLabel="Continue" className="mt-8 [&>div:last-child]:justify-stretch [&>div:last-child>button]:w-full" resetOnSuccess={false}>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required placeholder="name@reklama.demo" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>

        <div className="mt-12">
          <p className="text-[13px] text-neutral-500">Or explore with a demo account</p>
          <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
            {demoUsers.map((u) => (
              <li key={u.id} className="border-b border-neutral-100 last:border-b-0">
                <ActionButton
                  action={demoLoginAction}
                  fields={{ email: u.email }}
                  variant="ghost"
                  full
                  className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal text-neutral-900 hover:bg-neutral-50"
                >
                  <Avatar name={u.name} />
                  <span className="flex flex-1 flex-col leading-tight">
                    <span className="text-sm font-medium">{u.name}</span>
                    <span className="text-[13px] text-neutral-500">{ROLE_LABEL[u.role]}</span>
                  </span>
                  <ChevronRight className="text-neutral-300" />
                </ActionButton>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-neutral-400">Every demo account uses the password demo123.</p>
        </div>
      </div>
    </div>
  );
}
