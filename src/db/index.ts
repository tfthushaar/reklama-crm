import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { isSeeded, seedDemoData, wipeAll } from "./seed";

export type DB = LibSQLDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as unknown as { __reklamaDb?: Promise<DB> };

export function createDb(url: string, authToken?: string): DB {
  return drizzle(createClient({ url, authToken }), { schema });
}

/** Turso credentials, accepting the variable names used by the Vercel integration and by hand-made setups. */
export function remoteConfig() {
  const url = process.env.TURSO_DATABASE_URL || (process.env.DATABASE_URL?.startsWith("libsql://") ? process.env.DATABASE_URL : undefined);
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  return url ? { url, authToken } : null;
}

async function connect(): Promise<DB> {
  const remote = remoteConfig();
  let db: DB;
  if (remote) {
    db = createDb(remote.url, remote.authToken);
  } else if (process.env.VERCEL) {
    throw new Error("No database configured: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project.");
  } else {
    fs.mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
    db = createDb("file:.data/local.db");
    await db.run(sql`PRAGMA foreign_keys = ON`);
  }
  await migrate(db, { migrationsFolder: MIGRATIONS });
  if (!(await isSeeded(db))) {
    await wipeAll(db);
    await seedDemoData(db);
  }
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
  await wipeAll(db);
  await seedDemoData(db);
}
