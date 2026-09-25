import { sql } from "drizzle-orm";
import type { Executor } from "@/db";
import { fy, today } from "./format";

const PREFIX = {
  quote: "QT",
  booking: "BK",
  invoice: "RG",
  proforma: "PI",
  receipt: "RC",
} as const;

export type Series = keyof typeof PREFIX;

/** Atomically takes the next number in a financial-year series, e.g. RG/2026-27/0007. */
export async function nextNumber(db: Executor, series: Series, onDate: string = today()): Promise<string> {
  const year = fy(onDate);
  const key = `${series}:${year}`;
  const res = await db.execute<{ n: number }>(sql`
    INSERT INTO number_series (key, next) VALUES (${key}, 2)
    ON CONFLICT (key) DO UPDATE SET next = number_series.next + 1
    RETURNING next - 1 AS n`);
  const n = Number(res.rows[0]!.n);
  return `${PREFIX[series]}/${year}/${String(n).padStart(4, "0")}`;
}
