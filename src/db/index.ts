import "server-only";
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { seedDemoData } from "./seed";

export type DB = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const MIGRATIONS = path.join(process.cwd(), "drizzle");
export const DATA_DIR = path.join(process.cwd(), ".data");

const g = globalThis as unknown as { __reklamaDb?: Promise<DB> };

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  let db: DB;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 5 });
    const pgDb = drizzlePg(pool, { schema });
    await migratePg(pgDb, { migrationsFolder: MIGRATIONS });
    db = pgDb as unknown as DB;
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const client = new PGlite(path.join(DATA_DIR, "pglite"));
    db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder: MIGRATIONS });
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
  if (count === 0) await seedDemoData(db);
  return db;
}

export function getDb(): Promise<DB> {
  if (!g.__reklamaDb) {
    g.__reklamaDb = connect().catch((err) => {
      g.__reklamaDb = undefined;
      throw err;
    });
  }
  return g.__reklamaDb;
}

export async function resetDemoData(db: DB) {
  const tables = [
    "audit_log",
    "payments",
    "invoice_lines",
    "invoices",
    "booking_files",
    "booking_lines",
    "holds",
    "quote_lines",
    "quote_versions",
    "bookings",
    "quotes",
    "maintenance_tickets",
    "asset_photos",
    "assets",
    "site_owners",
    "tasks",
    "activities",
    "contacts",
    "clients",
    "number_series",
    "company_settings",
    "users",
  ];
  await db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
  await seedDemoData(db);
}
