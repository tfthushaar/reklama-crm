# Reklama CRM (prototype)

A working prototype of the CRM for **Reklama Global**, an outdoor-advertising and digital-screen (DOOH) company. It covers the whole path from lead to paid invoice:

**lead → conversations → quote → booking → campaign → invoice → payment → renewal**

It follows `PLAN.md`, which is based on the client's requirements document. The UI is deliberately simple: every screen tells you the next step.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

- **No database setup needed.** A local SQLite file (`.data/local.db`) is created on first start and filled with realistic demo data.
- All sample dates are relative to today, so the demo always looks current.

## Prototype hosting: Vercel + Turso

> **This setup is for the prototype only.** Vercel's free tier and a Turso (serverless SQLite) database are enough to demo the CRM to Reklama. For production we will scale up the hosting, database, file storage and monitoring. See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) §3.

- **App:** Vercel project `reklama-crm`, linked to this GitHub repo. Every push to `main` deploys automatically.
- **Database:** Turso, provisioned through Vercel's Turso integration. It adds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the project.
- **First-time setup, or reloading demo data** from your machine:

  ```bash
  vercel env pull .env.local                # fetch the Turso credentials
  npm run db:setup:remote                   # create tables + load demo data
  npm run db:setup:remote -- --reset        # wipe and reload demo data
  ```

  The app also creates the tables and demo data by itself on first request if the database is empty.
- **Prototype limits:**
  - Uploads are stored in the database and capped at 4 MB each.
  - The first request after a quiet period is slower, because the server "cold-starts".

**Demo logins.** Click a name on the sign-in page, or use the email with the password `demo123`.

| Person | Role | Sees |
|---|---|---|
| Rahul Mehta | Owner | Everything, including settings and approvals |
| Priya Sharma | Sales Manager | All leads, quotes, team activity; approves discounts up to 20% |
| Arjun Rao / Sneha Iyer | Sales Executive | Their leads, reminders and quotes; discounts up to 10% |
| Vikram Singh | Operations | Screens, bookings, creatives, proof of display, maintenance |
| Anita Desai | Accounts | Invoices, payments, receipts, outstanding |

**Reset the demo.** Sign in as the Owner, then go to **Settings → Data & backup → Reset demo data**. This restores a clean dataset.

## 10-minute demo script

1. **Owner home (Rahul).**
   - The "Needs your attention" list: a discount to approve, screens on hold about to be released, unassigned leads, overdue invoices, a campaign starting without its creative, a permit expiring.
   - Collections, outstanding, occupancy, and team activity for the week.
2. **Leads (Arjun).**
   - Drag a card along the pipeline.
   - Open **Lotus Dental Clinics** → **Log call**: tap an outcome, tap "Tomorrow" for the follow-up. It lands on the timeline and in My tasks.
3. **Screens.**
   - Pick dates to see which screens are free.
   - Open *MG Road Metro LED*: 60-day availability strip, holds, bookings, this month's revenue vs. rent.
   - The **Availability calendar** shows every screen by day. LED screens show the slots still free.
4. **New quote.**
   - Add a hoarding and an LED screen. On the LED, switch **Slots ↔ Whole screen** and change the slot count.
   - Add printing. GST, impressions and CPM update live.
   - Save → **Send to client**. The screens are held, a follow-up is scheduled, and WhatsApp/email open with the message ready.
   - **PDF** gives a branded quotation with site photos.
5. **Discount approval.**
   - Any quote with a discount above the person's limit goes to *Needs approval*.
   - Sign in as Priya and approve *UrbanFit* from the home page.
6. **Client accepted → book it.**
   - The booking reserves the screens. Another client can no longer quote those dates: the screen shows "Booked" in the picker.
   - Operations gets a task to collect the creative.
7. **Booking (Vikram).** Move the campaign through its steps (creative received → approved → live) and upload proof-of-display photos.
8. **Invoice (Anita).**
   - **Create invoice** from the booking. You can bill the full amount or a 25% or 50% advance as a proforma.
   - The invoice is numbered per financial year, e.g. `RG/2026-27/0005`.
   - GST is split CGST+SGST inside the state and IGST across states. See *Mediawave*, which is in Maharashtra and is an agency getting 15% commission.
   - **Record payment** with a TDS preset, then print the receipt.
9. **Reports.** Pipeline, lead sources, sales by person, team activity, screen occupancy and margin, collections, and an Excel export of everything.

## What's in the prototype

| Area | Features |
|---|---|
| Leads & clients | Kanban pipeline, won/lost with reasons, owner assignment, duplicate detection (name / phone / email / GSTIN), Excel/CSV import with template, agency clients with commission, GSTIN → state for GST |
| Conversations | One timeline per client (calls, WhatsApp, email, meetings, notes, system events), filters by type and person, `tel:` / `wa.me` / `mailto:` quick actions that log automatically |
| Tasks | Reminders with required outcome on completion, next follow-up in one tap, team view with overdue counts |
| Automatic reminders | Created for: quote follow-ups, holds about to expire, renewals, overdue invoices, permit and lease expiry |
| Screens | LED and hoardings, sold by **slots, whole screen, or both**; photos (day/night); availability strip and calendar; site owners and leases; permits; maintenance tickets; Excel import |
| Quotes | Guided builder with live availability, per-screen dates, slots vs exclusive, discounts, production extras, agency commission, GST, impressions/CPM |
| Quote workflow | Approval above discount limits, versions (revise → v2), holds with expiry, branded PDF |
| Bookings | One-click from quote, capacity check under a database lock (no double booking), campaign steps, release order, creatives, proof of display, extend, cancel |
| Billing | Tax and proforma invoices, gap-free numbering per financial year, CGST/SGST/IGST, SAC code, agency commission, partial payments with TDS, receipts, ageing, reminders |
| Reports | Sales and pipeline, team activity, screen occupancy and margin, money, Excel exports |
| Platform | Five roles with permissions, audit log, global search, full data export, mobile-friendly layout |

**Not built yet** (see `PLAN.md` §9, phases 2–3):
- Map-based planning (deferred by decision)
- Live WhatsApp Business API, telephony and email sync
- Client portal
- Tally / Zoho sync and e-invoicing
- Field-crew geo-verified photos
- Creative spec checks
- Sales targets

## Tech

- **App:** Next.js 16 (App Router, server actions) + TypeScript + Tailwind CSS 4.
- **Database:** Drizzle ORM on SQLite / libSQL. It uses a local file in development and Turso when `TURSO_DATABASE_URL` is set (see `.env.example`). Migrations in `drizzle/` run automatically on start.
- **Where the logic lives:**
  - Business rules: `src/lib/services/`, covering quotes, bookings, invoices and housekeeping (automatic reminders and expiries).
  - Pricing and GST maths: `src/lib/pricing.ts`, shared by the browser and the server.
  - Availability: `src/lib/availability.ts`.
- **Uploaded files:** stored in the database (the `stored_files` table), so the app runs without a server disk. Move them to object storage for production.

**Schema changes:** edit `src/db/schema.ts`, then run `npm run db:generate`.

**Deploying anywhere:** set `SESSION_SECRET`, `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The local SQLite file is only for development.
