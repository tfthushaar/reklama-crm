# Developing Reklama

This is the technical guide. For what the product does, see the [README](../README.md).

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

- **No database to install.** A local SQLite file (`.data/local.db`) is created on first start and filled with demo data.
- **Dates stay current.** Sample dates are relative to today, so the demo always looks up to date.
- **Demo sign-in.** Click a name on the sign-in page. Every demo account uses the password `demo123`.
- **Reset the data.** Run `npm run db:setup -- --reset`, or use Settings, then Data & backup, then Reset demo data.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, server components, server actions), TypeScript |
| UI | Tailwind CSS 4, Geist typeface, lucide icons. Design tokens are in `src/app/globals.css`; primitives are in `src/components/ui.tsx`. |
| Data | Drizzle ORM on SQLite / libSQL: a local file in development, Turso when `TURSO_DATABASE_URL` is set |
| Files | Stored in the `stored_files` table, so the app runs on serverless hosts without a disk (4 MB cap) |

Next.js 16 differs from older versions. Check `node_modules/next/dist/docs/` before relying on older conventions (see `AGENTS.md`).

## Where things live

| Path | What |
|---|---|
| `src/db/schema.ts` | Tables. After changing it, run `npm run db:generate` to write a migration to `drizzle/`. |
| `src/db/seed.ts` | Demo data |
| `src/lib/services/` | Business rules: quotes (versions, approvals, holds), bookings (capacity checks, extensions), invoices (numbering, GST, TDS), housekeeping (automatic reminders and expiries) |
| `src/lib/pricing.ts` | Pricing and GST maths, shared by browser and server |
| `src/lib/availability.ts` | Slot and exclusive capacity per screen per day |
| `src/app/actions/` | Server actions, one file per area |
| `src/app/(app)/` | Signed-in pages |
| `src/app/print/` | Printable quotation, invoice and receipt |

Migrations run automatically when the app connects. The first connection also seeds demo data if the database is empty.

## Prototype hosting: Vercel + Turso

> **This setup is for the prototype only.** For production we will scale up hosting, database, file storage and monitoring. See [PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md), section 3.

- **Vercel:**
  - The project `reklama-crm` is linked to this GitHub repository; every push to `main` deploys to https://reklama-crm-sandy.vercel.app.
  - Environment variables: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, both added by the Turso integration, plus `SESSION_SECRET`.
- **Turso:** provisioned through the Vercel marketplace integration, region AWS us-east-1, next to Vercel's default server region.
- **Loading demo data into the hosted database from your machine:**

  ```bash
  vercel env pull .env.vercel.local        # fetch the Turso credentials
  npm run db:setup:remote                  # create tables and load demo data
  npm run db:setup:remote -- --reset       # wipe and reload
  ```

  Keep these credentials out of `.env.local`. Next.js loads `.env.local` automatically, so local development would then read and write the live demo database.

- **Prototype limits:**
  - Uploads are capped at 4 MB (Vercel's request limit).
  - The first request after a quiet period is slower while the server starts.
  - App and database run in the US.

## Checks

```bash
npm run typecheck
npm run build
```
