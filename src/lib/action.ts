import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/components/forms";
import { UserError } from "./services/common";
import { toPaise } from "./format";

export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof Error && e.message.startsWith("You don't have permission")) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export const form = {
  str(fd: FormData, key: string): string | null {
    const v = fd.get(key);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  },
  req(fd: FormData, key: string, label: string): string {
    const v = form.str(fd, key);
    if (!v) throw new UserError(`${label} is required.`);
    return v;
  },
  int(fd: FormData, key: string): number | null {
    const v = form.str(fd, key);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  },
  num(fd: FormData, key: string): number | null {
    const v = form.str(fd, key);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  },
  money(fd: FormData, key: string): number | null {
    const v = form.str(fd, key);
    return v === null ? null : toPaise(v);
  },
  bool(fd: FormData, key: string): boolean {
    const v = fd.get(key);
    return v === "on" || v === "true" || v === "1";
  },
  id(fd: FormData, key = "id"): number {
    const n = Number(fd.get(key));
    if (!Number.isInteger(n) || n <= 0) throw new UserError("Missing record reference.");
    return n;
  },
};
