# Reklama CRM: what's left, and what it takes to go live

*Status as of 2026-09-25. Companion to [PLAN.md](PLAN.md) (full product plan) and [README.md](README.md) (how to run the prototype).*

---

## 1. Where things stand

The prototype runs the whole path end to end: **lead → conversations → quote → booking → campaign → invoice → payment**. It covers:

- Everything in the spec's Phase 1, apart from real WhatsApp/call/email integrations (it opens WhatsApp, the dialler or email and logs the action instead).
- Part of Phase 2: site owners, maintenance, screen profit & loss, and the reports.

It is still a **demo**, not a system to run the business on:

- **Hosting is prototype-only.** The online demo runs on Vercel's free tier with a Turso (serverless SQLite) database. That is fine for showing Reklama the product. **It is not the production setup: we will scale up hosting, database, file storage and monitoring before go-live** (see §3).
- It uses sample demo data.
- WhatsApp messages, emails and calls are opened on the user's own device and logged. The system itself doesn't send anything.
- Quote and invoice PDFs come from the browser's "Save as PDF", so they can't be attached to messages automatically.
- Uploaded files are stored inside the database and capped at 4 MB each.
- It hasn't been security-reviewed, load-tested or checked by a CA.

---

## 2. What's left to build

### 2a. Gaps in features that already exist (close these before go-live)

| Area | What's missing |
|---|---|
| Editing records | Edit or delete contacts; change a booking's screens or slots after confirmation (swap a screen, add a screen); archive/restore clients and screens; merge duplicate clients |
| Holds | A visible 1st/2nd option queue per screen, manual "extend hold", notifying the next in line when a hold lapses (today holds simply expire, and conflicting holds are released on booking) |
| Visibility rules | Decide whether sales executives see only their own clients, and enforce it on every list and page |
| Configuration | Editable pipeline stages, lost reasons, industries, lead sources and production presets (fixed lists today) |
| Notifications | Reminders appear only inside the app. Add a daily email digest and browser push; add WhatsApp once the integration exists |
| Documents | Server-generated PDFs for quotes, invoices and receipts, so they can be attached to email/WhatsApp automatically and stored with the record |
| Credit notes | Credit/debit notes for cancellations after payment, discounts after invoicing and make-goods, with their own number series |
| Scale | Pagination on every list; faster fuzzy search (Postgres full-text / trigram) instead of simple "contains" matching |
| Accounts | Forgot/change password, sign out of all devices |
| Bulk actions | Reassign many leads at once, bulk status updates |

### 2b. Phase 2: operations & finance ([PLAN.md](PLAN.md) §4, §9)

- **Creative management:** versions, client approval, and automatic checks of size/resolution/duration against the screen's specs. Mock-ups of the creative on the site photo.
- **Static execution:**
  - Printing and mounting work orders to vendors and crews.
  - A field-crew phone app with GPS- and time-stamped photos; uploads from the wrong location are rejected.
  - An automatic proof-of-display report as a PDF.
- **DOOH execution:** play schedule per screen, and import of play logs from the screen software to compare delivered plays with what was sold.
- **Downtime & make-goods:** link maintenance downtime to the affected bookings; offer extra days or slots, or a credit note.
- **Site costs:**
  - Lease rent schedules with yearly escalations.
  - Landlord payments and TDS on rent.
  - Electricity bills.
  - Vendor bills for third-party sites.
  - Full profit & loss per screen from actual costs.
- **Billing:**
  - Monthly billing schedules for long campaigns.
  - Payment links (UPI/Razorpay) that reconcile automatically.
  - TDS certificate tracking.
- **Accounting:** Tally export or Zoho Books sync; e-invoicing (IRN/QR) if Reklama's turnover requires it.
- **Sales:** monthly targets and incentives, a renewal flow that gives the current advertiser first refusal, and capture of competitor sites as leads.

### 2c. Phase 3: integrations & growth

- **WhatsApp Business API** through a provider (Interakt, Gupshup, WATI, AiSensy or Meta directly):
  - Approved templates
  - Sending PDFs from the app
  - Capturing replies on the client timeline
- **Telephony** (Exotel, MyOperator, Knowlarity or Ozonetel): click-to-call through a business number, automatic call logs, recordings.
- **Two-way email sync** with Google Workspace or Microsoft 365.
- **Client/agency portal:** live campaigns, proof photos, invoices, online payment and creative approval.
- **Shareable proposal link** that tracks when the client opens it.
- **Vacancy broadcast:** "screens free this month" sent to agencies.
- **Screen software integration** for LED screens (Novastar, Xibo, Broadsign…) and screen-health alerts.
- **AI assist:** timeline summaries, drafting follow-ups, reading release orders to pre-fill bookings.
- **Automated lead sourcing**, only with a named data provider and a lawful basis.

WhatsApp template approval and telephony KYC need provider paperwork, so start it early.

### 2d. Deferred by decision

- **Map-based planning:** map view, radius search, Street View.

---

## 3. What makes it production-ready

Everything in this section is needed **before Reklama runs real business on it**. It is separate from the new features above.

### Hosting & data: scaling up from the prototype setup

The prototype runs on **Vercel (free tier) + Turso (free tier)**, chosen only so Reklama can try it online at no cost. For production:

| | Prototype (now) | Production (planned) |
|---|---|---|
| App hosting | Vercel Hobby, a single region | Vercel Pro (or AWS/Render) in the Mumbai region, with staging and production environments |
| Database | Turso free tier (SQLite) | Turso paid tier with backups and point-in-time restore, **or** managed PostgreSQL in India (Supabase Mumbai / AWS RDS `ap-south-1`). The code uses Drizzle ORM, so either move is contained. |
| Files | Stored in the database, 4 MB cap | Private object storage (S3 / Cloudflare R2) with signed links and larger uploads |
| Scheduled jobs | Run when someone opens a page | A proper scheduler (Vercel Cron / queue worker) |
| Monitoring | None | Error tracking, uptime checks, alerts |

- [ ] Choose the production database and move to a paid plan with backups, in an India region next to the app.
- [ ] App hosting on a paid plan, deployed in the same region as the database.
- [ ] Object storage for photos and documents instead of the database. Keep files private and use signed links.
- [ ] Custom domain with HTTPS, e.g. `crm.reklamaglobal.com`.
- [ ] Separate **staging** and **production** environments. Migrations run automatically on deploy to staging first.
- [ ] **Backups:**
  - Daily backups plus point-in-time recovery.
  - A tested restore, practised once before go-live.
  - Uploaded files backed up too.
- [ ] **Load Reklama's real data:**
  - Import their inventory Excel and client list.
  - Remove the demo data and the "Reset demo data" button.
  - Set real company details, GSTIN, bank details and terms.

### Security & access

- [ ] Set a strong `SESSION_SECRET` in every environment. The code has a development fallback that must never be used live.
- [ ] Sessions that expire and can be revoked (stored server-side), sign out everywhere, password reset by email.
- [ ] **Two-factor login** for the Owner and Accounts roles.
- [ ] Rate limiting and lockout on sign-in.
- [ ] **Permission review of every action.**
  - Several actions today only check that someone is signed in. Examples: editing any client, extending a booking, uploading files, updating maintenance tickets.
  - Tighten each to the right role, and to the record's owner where relevant.
- [ ] **Upload safety:**
  - Enforce size and type limits on the server.
  - Virus-scan uploads.
  - Never serve uploads from the app's own domain without `Content-Disposition` / `nosniff`.
- [ ] Security headers and a Content-Security-Policy.
- [ ] Fix `npm audit` findings and keep dependencies updated (e.g. Dependabot).
- [ ] **India's DPDP Act 2023:**
  - Record consent before WhatsApp/marketing messages.
  - Keep a privacy notice for client contacts.
  - Define how long data is kept, and handle deletion requests.
  - Store data in India.
- [ ] Make the audit log append-only; nobody can edit or delete it from the app.

### Reliability & operations

- [ ] **A proper scheduler** (cron / queue worker) for:
  - Hold expiry
  - Quote expiry
  - Automatic reminders
  - Overdue alerts
  - Daily digests

  Today these run when someone opens a page.
- [ ] A background queue for sending email/WhatsApp, with retries.
- [ ] Error tracking (Sentry or similar), uptime monitoring, and alerts to the developer.
- [ ] Structured logs that aren't visible to users.
- [ ] Database indexes checked against real query patterns, and a quick load test with 2–3 years of data (thousands of clients, tens of thousands of activities).
- [ ] A documented runbook: deploy, roll back, restore a backup, rotate secrets, add a user.

### Finance & compliance (confirm with Reklama's CA)

- [ ] **Invoice format** checked against GST rules:
  - Mandatory fields
  - SAC code (currently 998366, unconfirmed)
  - Place of supply for advertising services
  - Reverse-charge note where it applies
- [ ] **Numbering:**
  - Series continue across financial years (FY rollover).
  - Issued invoices can never be deleted, only cancelled or credited. This is already enforced.
  - Credit note series.
- [ ] Which TDS sections and rates clients deduct; TDS certificate tracking.
- [ ] Whether **e-invoicing** (IRN/QR through a GSP) is mandatory for Reklama's turnover.
- [ ] Rounding rules, and whether GST is ever included in quoted rates.

### Quality & testing

- [ ] **Automated tests:**
  - Unit tests for pricing/GST, availability and numbering.
  - Integration tests for quotes → bookings → invoices, including two people booking the same screen at the same moment.
  - An end-to-end browser test of the main flow, run in CI on every change.
- [ ] CI pipeline (GitHub Actions): type check, lint, tests and build on every push.
- [ ] Accessibility pass: keyboard use in dialogs, labels on every input, colour contrast.
- [ ] Testing on real phones (Android Chrome, iPhone Safari) and on slow connections.
- [ ] **User acceptance testing** with Reklama staff against the checklist in [PLAN.md](PLAN.md) §10, ideally a parallel run beside their current Excel/WhatsApp process.

### Go-live & adoption

- [ ] Short training per role (sales, operations, accounts, owner), plus a 1-page guide for each.
- [ ] A named support contact, a response time for bugs, and a bug-fix warranty period.
- [ ] A data export / exit process (already available: Settings → Export everything).
- [ ] A signed statement of work covering scope, costs, ownership of the code and data, and third-party charges.

---

## 4. Decisions still needed from Reklama

These change how the system behaves; see [PLAN.md](PLAN.md) §11.

1. **LED selling:** mostly slots, mostly whole-screen, or both? What are the loop and slot lengths for each screen?
2. **Visibility:** can sales executives see other executives' clients?
3. **Inventory:** their current Excel sheet and real rate cards.
4. **Agencies:** how much business comes through agencies, and the usual commission.
5. **GST & accounting:** one GSTIN or several states? Which accounting software (Tally or Zoho)? Is e-invoicing required?
6. **LED hardware:** which hardware/software runs the screens, and can it export play logs?
7. **Existing providers:** email (Google or Microsoft), a WhatsApp Business number, a telephony provider.
8. **Holds and confirmation:** how long should screens be held, and is a release order or an advance required before confirming?
9. **Users:** how many people per role? Are field crews in-house or contractors?
10. **Ownership:** a one-off build for Reklama, or a product for other outdoor-advertising companies too? The second needs multi-company support from the start.

---

## 5. Suggested order

| Stage | Scope |
|---|---|
| 1. Production hardening | Everything in §3, plus the gaps in §2a |
| 2. Pilot | Load real data, train users, parallel run, fix feedback |
| 3. Phase 2 | Operations & finance (§2b) |
| 4. Phase 3 | Integrations & growth (§2c) |

### Running costs to budget for

Get exact figures from the chosen providers.

- App hosting, managed database and file storage (monthly).
- Domain and business email.
- WhatsApp Business API: provider fee plus Meta's per-conversation charges.
- Telephony: virtual number rental plus per-minute charges.
- Payment gateway fees (per transaction).
- A GSP for e-invoicing, if needed.
- Error monitoring and backups.
- Ongoing maintenance and support.
