// Creates tables and loads the demo data into the database in TURSO_DATABASE_URL
// (or the local .data/local.db file). Usage: npm run db:setup [-- --reset]
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "../src/db/schema";
import { isSeeded, seedDemoData, wipeAll } from "../src/db/seed";
import { runHousekeeping } from "../src/lib/services/housekeeping";

async function main() {
  const url =
    process.env.TURSO_DATABASE_URL ||
    (process.env.DATABASE_URL?.startsWith("libsql://") ? process.env.DATABASE_URL : undefined) ||
    "file:.data/local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
  if (url.startsWith("file:")) fs.mkdirSync(".data", { recursive: true });
  const db = drizzle(createClient({ url, authToken }), { schema });
  console.log(`Database: ${url.replace(/\?.*$/, "")}`);
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations applied");
  const reset = process.argv.includes("--reset");
  if (reset || !(await isSeeded(db))) {
    const t0 = Date.now();
    await wipeAll(db);
    await seedDemoData(db);
    await runHousekeeping(db, true);
    console.log(`Demo data loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } else {
    console.log("Demo data already present (use --reset to reload)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
