import { sqliteTable, integer, text, real, blob, index } from "drizzle-orm/sqlite-core";

// SQLite / Turso schema. Money is stored as integer paise, dates as 'YYYY-MM-DD' text,
// timestamps as epoch milliseconds.
const money = (name: string) => integer(name);
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const day = (name: string) => text(name);
const bool = (name: string) => integer(name, { mode: "boolean" });
const now = () => new Date();
const id = () => integer("id").primaryKey({ autoIncrement: true });

export const ROLES = ["owner", "sales_manager", "sales_exec", "operations", "accounts"] as const;
const CLIENT_TYPES = ["advertiser", "agency", "government"] as const;
const STAGE_KEYS = ["new", "contacted", "qualified", "meeting", "proposal", "negotiation", "won", "lost"] as const;
const ACTIVITY_KEYS = ["call", "whatsapp", "email", "meeting", "note", "system"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;
const TASK_STATUSES = ["open", "done"] as const;
const ASSET_TYPES = ["led", "hoarding"] as const;
const SALE_MODES = ["exclusive", "slots", "both"] as const;
const ASSET_STATUSES = ["active", "maintenance", "inactive"] as const;
const OWNERSHIPS = ["owned", "leased", "third_party"] as const;
const QUOTE_STATUSES = ["draft", "pending_approval", "sent", "accepted", "rejected", "expired"] as const;
const LINE_KINDS = ["media", "production"] as const;
const BOOKING_MODES = ["exclusive", "slots"] as const;
const HOLD_STATUSES = ["active", "released", "converted"] as const;
const BOOKING_STATUSES = ["confirmed", "creative_received", "creative_approved", "live", "completed", "cancelled"] as const;
const FILE_KINDS = ["ro", "creative", "pop", "other"] as const;
const INVOICE_KINDS = ["proforma", "tax"] as const;
const INVOICE_STATUSES = ["draft", "issued", "partial", "paid", "cancelled"] as const;
const TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role", { enum: ROLES }).notNull(),
  passwordHash: text("password_hash").notNull(),
  active: bool("active").notNull().default(true),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const companySettings = sqliteTable("company_settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull(),
  legalName: text("legal_name"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  stateCode: text("state_code"),
  gstin: text("gstin"),
  pan: text("pan"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankIfsc: text("bank_ifsc"),
  upiId: text("upi_id"),
  sacCode: text("sac_code").notNull().default("998366"),
  gstRate: real("gst_rate").notNull().default(18),
  holdHours: integer("hold_hours").notNull().default(48),
  quoteValidityDays: integer("quote_validity_days").notNull().default(15),
  execDiscountLimit: real("exec_discount_limit").notNull().default(10),
  managerDiscountLimit: real("manager_discount_limit").notNull().default(20),
  paymentTermsDays: integer("payment_terms_days").notNull().default(15),
  quoteTerms: text("quote_terms"),
  invoiceTerms: text("invoice_terms"),
});

export const clients = sqliteTable(
  "clients",
  {
    id: id(),
    name: text("name").notNull(),
    type: text("type", { enum: CLIENT_TYPES }).notNull().default("advertiser"),
    industry: text("industry"),
    website: text("website"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    gstin: text("gstin"),
    pan: text("pan"),
    source: text("source"),
    requirement: text("requirement"),
    preferredLocations: text("preferred_locations"),
    budget: money("budget"),
    timing: text("timing"),
    stage: text("stage", { enum: STAGE_KEYS }).notNull().default("new"),
    lostReason: text("lost_reason"),
    ownerId: integer("owner_id").references(() => users.id),
    agencyCommission: real("agency_commission").notNull().default(0),
    creditDays: integer("credit_days"),
    notes: text("notes"),
    lastActivityAt: ts("last_activity_at"),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("clients_owner_idx").on(t.ownerId), index("clients_stage_idx").on(t.stage)],
);

export const contacts = sqliteTable("contacts", {
  id: id(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  designation: text("designation"),
  phone: text("phone"),
  email: text("email"),
  isPrimary: bool("is_primary").notNull().default(false),
});

export const activities = sqliteTable(
  "activities",
  {
    id: id(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id),
    type: text("type", { enum: ACTIVITY_KEYS }).notNull(),
    direction: text("direction"),
    outcome: text("outcome"),
    notes: text("notes"),
    durationMin: integer("duration_min"),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    occurredAt: ts("occurred_at").notNull().$defaultFn(now),
  },
  (t) => [index("activities_client_idx").on(t.clientId, t.occurredAt), index("activities_ref_idx").on(t.refType, t.refId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
    assignedTo: integer("assigned_to")
      .notNull()
      .references(() => users.id),
    createdBy: integer("created_by").references(() => users.id),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: ts("due_at").notNull(),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("normal"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("open"),
    outcome: text("outcome"),
    completedAt: ts("completed_at"),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    autoKey: text("auto_key").unique(),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("tasks_assignee_idx").on(t.assignedTo, t.status, t.dueAt)],
);

export const siteOwners = sqliteTable("site_owners", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const assets = sqliteTable("assets", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: ASSET_TYPES }).notNull(),
  city: text("city").notNull(),
  area: text("area"),
  address: text("address"),
  landmark: text("landmark"),
  mapLink: text("map_link"),
  widthFt: real("width_ft"),
  heightFt: real("height_ft"),
  resolution: text("resolution"),
  illumination: text("illumination"),
  loopSeconds: integer("loop_seconds"),
  slotSeconds: integer("slot_seconds"),
  totalSlots: integer("total_slots").notNull().default(1),
  saleMode: text("sale_mode", { enum: SALE_MODES }).notNull().default("exclusive"),
  monthlyRate: money("monthly_rate").notNull().default(0),
  slotRate: money("slot_rate"),
  minDays: integer("min_days").notNull().default(7),
  dailyTraffic: integer("daily_traffic"),
  operatingHours: text("operating_hours"),
  status: text("status", { enum: ASSET_STATUSES }).notNull().default("active"),
  ownership: text("ownership", { enum: OWNERSHIPS }).notNull().default("owned"),
  siteOwnerId: integer("site_owner_id").references(() => siteOwners.id),
  rentMonthly: money("rent_monthly"),
  leaseEnd: day("lease_end"),
  permitNumber: text("permit_number"),
  permitExpiry: day("permit_expiry"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const assetPhotos = sqliteTable("asset_photos", {
  id: id(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("day"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const maintenanceTickets = sqliteTable("maintenance_tickets", {
  id: id(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  status: text("status", { enum: TICKET_STATUSES }).notNull().default("open"),
  priority: text("priority", { enum: PRIORITIES }).notNull().default("normal"),
  assignedTo: integer("assigned_to").references(() => users.id),
  cost: money("cost"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  resolvedAt: ts("resolved_at"),
});

export const quotes = sqliteTable("quotes", {
  id: id(),
  number: text("number").notNull().unique(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  status: text("status", { enum: QUOTE_STATUSES }).notNull().default("draft"),
  currentVersion: integer("current_version").notNull().default(1),
  validUntil: day("valid_until"),
  sentAt: ts("sent_at"),
  respondedAt: ts("responded_at"),
  rejectReason: text("reject_reason"),
  bookingId: integer("booking_id"),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  updatedAt: ts("updated_at").notNull().$defaultFn(now),
});

export const quoteVersions = sqliteTable("quote_versions", {
  id: id(),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  mediaGross: money("media_gross").notNull().default(0),
  discountTotal: money("discount_total").notNull().default(0),
  commissionPct: real("commission_pct").notNull().default(0),
  commission: money("commission").notNull().default(0),
  production: money("production").notNull().default(0),
  taxable: money("taxable").notNull().default(0),
  cgst: money("cgst").notNull().default(0),
  sgst: money("sgst").notNull().default(0),
  igst: money("igst").notNull().default(0),
  total: money("total").notNull().default(0),
  maxDiscountPct: real("max_discount_pct").notNull().default(0),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: ts("approved_at"),
  notes: text("notes"),
  terms: text("terms"),
  sentVia: text("sent_via"),
  sentTo: text("sent_to"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const quoteLines = sqliteTable("quote_lines", {
  id: id(),
  versionId: integer("version_id")
    .notNull()
    .references(() => quoteVersions.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: LINE_KINDS }).notNull(),
  assetId: integer("asset_id").references(() => assets.id),
  description: text("description"),
  startDate: day("start_date"),
  endDate: day("end_date"),
  days: integer("days"),
  mode: text("mode", { enum: BOOKING_MODES }),
  slots: integer("slots"),
  rate: money("rate").notNull().default(0),
  qty: real("qty").notNull().default(1),
  gross: money("gross").notNull().default(0),
  discountPct: real("discount_pct").notNull().default(0),
  amount: money("amount").notNull().default(0),
});

export const holds = sqliteTable(
  "holds",
  {
    id: id(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id),
    quoteId: integer("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    startDate: day("start_date").notNull(),
    endDate: day("end_date").notNull(),
    slots: integer("slots").notNull(),
    exclusive: bool("exclusive").notNull().default(false),
    status: text("status", { enum: HOLD_STATUSES }).notNull().default("active"),
    expiresAt: ts("expires_at").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("holds_asset_idx").on(t.assetId, t.status)],
);

export const bookings = sqliteTable("bookings", {
  id: id(),
  number: text("number").notNull().unique(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  quoteId: integer("quote_id").references(() => quotes.id),
  versionId: integer("version_id").references(() => quoteVersions.id),
  title: text("title").notNull(),
  status: text("status", { enum: BOOKING_STATUSES }).notNull().default("confirmed"),
  startDate: day("start_date").notNull(),
  endDate: day("end_date").notNull(),
  roNumber: text("ro_number"),
  roDate: day("ro_date"),
  advanceAmount: money("advance_amount"),
  paymentTerms: text("payment_terms"),
  ownerId: integer("owner_id").references(() => users.id),
  commissionPct: real("commission_pct").notNull().default(0),
  total: money("total").notNull().default(0),
  notes: text("notes"),
  cancelReason: text("cancel_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().$defaultFn(now),
  updatedAt: ts("updated_at").notNull().$defaultFn(now),
});

export const bookingLines = sqliteTable(
  "booking_lines",
  {
    id: id(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: LINE_KINDS }).notNull().default("media"),
    assetId: integer("asset_id").references(() => assets.id),
    description: text("description"),
    startDate: day("start_date"),
    endDate: day("end_date"),
    mode: text("mode", { enum: BOOKING_MODES }),
    slots: integer("slots"),
    amount: money("amount").notNull().default(0),
  },
  (t) => [index("booking_lines_asset_idx").on(t.assetId)],
);

export const bookingFiles = sqliteTable("booking_files", {
  id: id(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").references(() => assets.id),
  kind: text("kind", { enum: FILE_KINDS }).notNull(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const invoices = sqliteTable("invoices", {
  id: id(),
  number: text("number").unique(),
  kind: text("kind", { enum: INVOICE_KINDS }).notNull().default("tax"),
  status: text("status", { enum: INVOICE_STATUSES }).notNull().default("draft"),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  bookingId: integer("booking_id").references(() => bookings.id),
  issueDate: day("issue_date").notNull(),
  dueDate: day("due_date").notNull(),
  placeOfSupply: text("place_of_supply"),
  gross: money("gross").notNull().default(0),
  commissionPct: real("commission_pct").notNull().default(0),
  commission: money("commission").notNull().default(0),
  taxable: money("taxable").notNull().default(0),
  cgst: money("cgst").notNull().default(0),
  sgst: money("sgst").notNull().default(0),
  igst: money("igst").notNull().default(0),
  total: money("total").notNull().default(0),
  notes: text("notes"),
  cancelReason: text("cancel_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const invoiceLines = sqliteTable("invoice_lines", {
  id: id(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  sac: text("sac"),
  isMedia: bool("is_media").notNull().default(true),
  amount: money("amount").notNull(),
});

export const payments = sqliteTable("payments", {
  id: id(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  receiptNumber: text("receipt_number").notNull().unique(),
  date: day("date").notNull(),
  amount: money("amount").notNull(),
  tds: money("tds").notNull().default(0),
  mode: text("mode").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => users.id),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export const numberSeries = sqliteTable("number_series", {
  key: text("key").primaryKey(),
  next: integer("next").notNull().default(1),
});

export const auditLog = sqliteTable("audit_log", {
  id: id(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  summary: text("summary").notNull(),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

/** Uploaded files live in the database so the app runs on serverless hosts without a disk. */
export const storedFiles = sqliteTable("stored_files", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: ts("created_at").notNull().$defaultFn(now),
});

export type User = typeof users.$inferSelect;
export type Role = User["role"];
export type Client = typeof clients.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteVersion = typeof quoteVersions.$inferSelect;
export type QuoteLine = typeof quoteLines.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Settings = typeof companySettings.$inferSelect;
