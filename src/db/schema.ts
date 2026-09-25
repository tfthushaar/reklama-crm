import {
  pgTable,
  pgEnum,
  serial,
  integer,
  bigint,
  text,
  boolean,
  timestamp,
  date,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";

const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const day = (name: string) => date(name, { mode: "string" });

export const roleEnum = pgEnum("role", ["owner", "sales_manager", "sales_exec", "operations", "accounts"]);
export const clientTypeEnum = pgEnum("client_type", ["advertiser", "agency", "government"]);
export const stageEnum = pgEnum("stage", ["new", "contacted", "qualified", "meeting", "proposal", "negotiation", "won", "lost"]);
export const activityTypeEnum = pgEnum("activity_type", ["call", "whatsapp", "email", "meeting", "note", "system"]);
export const priorityEnum = pgEnum("priority", ["low", "normal", "high"]);
export const taskStatusEnum = pgEnum("task_status", ["open", "done"]);
export const assetTypeEnum = pgEnum("asset_type", ["led", "hoarding"]);
export const saleModeEnum = pgEnum("sale_mode", ["exclusive", "slots", "both"]);
export const assetStatusEnum = pgEnum("asset_status", ["active", "maintenance", "inactive"]);
export const ownershipEnum = pgEnum("ownership", ["owned", "leased", "third_party"]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "pending_approval", "sent", "accepted", "rejected", "expired"]);
export const lineKindEnum = pgEnum("line_kind", ["media", "production"]);
export const bookingModeEnum = pgEnum("booking_mode", ["exclusive", "slots"]);
export const holdStatusEnum = pgEnum("hold_status", ["active", "released", "converted"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "confirmed",
  "creative_received",
  "creative_approved",
  "live",
  "completed",
  "cancelled",
]);
export const fileKindEnum = pgEnum("file_kind", ["ro", "creative", "pop", "other"]);
export const invoiceKindEnum = pgEnum("invoice_kind", ["proforma", "tax"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "issued", "partial", "paid", "cancelled"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "in_progress", "resolved"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: roleEnum("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const companySettings = pgTable("company_settings", {
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
  gstRate: doublePrecision("gst_rate").notNull().default(18),
  holdHours: integer("hold_hours").notNull().default(48),
  quoteValidityDays: integer("quote_validity_days").notNull().default(15),
  execDiscountLimit: doublePrecision("exec_discount_limit").notNull().default(10),
  managerDiscountLimit: doublePrecision("manager_discount_limit").notNull().default(20),
  paymentTermsDays: integer("payment_terms_days").notNull().default(15),
  quoteTerms: text("quote_terms"),
  invoiceTerms: text("invoice_terms"),
});

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: clientTypeEnum("type").notNull().default("advertiser"),
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
    stage: stageEnum("stage").notNull().default("new"),
    lostReason: text("lost_reason"),
    ownerId: integer("owner_id").references(() => users.id),
    agencyCommission: doublePrecision("agency_commission").notNull().default(0),
    creditDays: integer("credit_days"),
    notes: text("notes"),
    lastActivityAt: ts("last_activity_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("clients_owner_idx").on(t.ownerId), index("clients_stage_idx").on(t.stage)],
);

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  designation: text("designation"),
  phone: text("phone"),
  email: text("email"),
  isPrimary: boolean("is_primary").notNull().default(false),
});

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id),
    type: activityTypeEnum("type").notNull(),
    direction: text("direction"),
    outcome: text("outcome"),
    notes: text("notes"),
    durationMin: integer("duration_min"),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("activities_client_idx").on(t.clientId, t.occurredAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
    assignedTo: integer("assigned_to")
      .notNull()
      .references(() => users.id),
    createdBy: integer("created_by").references(() => users.id),
    title: text("title").notNull(),
    notes: text("notes"),
    dueAt: ts("due_at").notNull(),
    priority: priorityEnum("priority").notNull().default("normal"),
    status: taskStatusEnum("status").notNull().default("open"),
    outcome: text("outcome"),
    completedAt: ts("completed_at"),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    autoKey: text("auto_key").unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assignedTo, t.status, t.dueAt)],
);

export const siteOwners = pgTable("site_owners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: assetTypeEnum("type").notNull(),
  city: text("city").notNull(),
  area: text("area"),
  address: text("address"),
  landmark: text("landmark"),
  mapLink: text("map_link"),
  widthFt: doublePrecision("width_ft"),
  heightFt: doublePrecision("height_ft"),
  resolution: text("resolution"),
  illumination: text("illumination"),
  loopSeconds: integer("loop_seconds"),
  slotSeconds: integer("slot_seconds"),
  totalSlots: integer("total_slots").notNull().default(1),
  saleMode: saleModeEnum("sale_mode").notNull().default("exclusive"),
  monthlyRate: money("monthly_rate").notNull().default(0),
  slotRate: money("slot_rate"),
  minDays: integer("min_days").notNull().default(7),
  dailyTraffic: integer("daily_traffic"),
  operatingHours: text("operating_hours"),
  status: assetStatusEnum("status").notNull().default("active"),
  ownership: ownershipEnum("ownership").notNull().default("owned"),
  siteOwnerId: integer("site_owner_id").references(() => siteOwners.id),
  rentMonthly: money("rent_monthly"),
  leaseEnd: day("lease_end"),
  permitNumber: text("permit_number"),
  permitExpiry: day("permit_expiry"),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const assetPhotos = pgTable("asset_photos", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("day"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const maintenanceTickets = pgTable("maintenance_tickets", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes"),
  status: ticketStatusEnum("status").notNull().default("open"),
  priority: priorityEnum("priority").notNull().default("normal"),
  assignedTo: integer("assigned_to").references(() => users.id),
  cost: money("cost"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  resolvedAt: ts("resolved_at"),
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  status: quoteStatusEnum("status").notNull().default("draft"),
  currentVersion: integer("current_version").notNull().default(1),
  validUntil: day("valid_until"),
  sentAt: ts("sent_at"),
  respondedAt: ts("responded_at"),
  rejectReason: text("reject_reason"),
  bookingId: integer("booking_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const quoteVersions = pgTable("quote_versions", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  mediaGross: money("media_gross").notNull().default(0),
  discountTotal: money("discount_total").notNull().default(0),
  commissionPct: doublePrecision("commission_pct").notNull().default(0),
  commission: money("commission").notNull().default(0),
  production: money("production").notNull().default(0),
  taxable: money("taxable").notNull().default(0),
  cgst: money("cgst").notNull().default(0),
  sgst: money("sgst").notNull().default(0),
  igst: money("igst").notNull().default(0),
  total: money("total").notNull().default(0),
  maxDiscountPct: doublePrecision("max_discount_pct").notNull().default(0),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: ts("approved_at"),
  notes: text("notes"),
  terms: text("terms"),
  sentVia: text("sent_via"),
  sentTo: text("sent_to"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const quoteLines = pgTable("quote_lines", {
  id: serial("id").primaryKey(),
  versionId: integer("version_id")
    .notNull()
    .references(() => quoteVersions.id, { onDelete: "cascade" }),
  kind: lineKindEnum("kind").notNull(),
  assetId: integer("asset_id").references(() => assets.id),
  description: text("description"),
  startDate: day("start_date"),
  endDate: day("end_date"),
  days: integer("days"),
  mode: bookingModeEnum("mode"),
  slots: integer("slots"),
  rate: money("rate").notNull().default(0),
  qty: doublePrecision("qty").notNull().default(1),
  gross: money("gross").notNull().default(0),
  discountPct: doublePrecision("discount_pct").notNull().default(0),
  amount: money("amount").notNull().default(0),
});

export const holds = pgTable(
  "holds",
  {
    id: serial("id").primaryKey(),
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
    exclusive: boolean("exclusive").notNull().default(false),
    status: holdStatusEnum("status").notNull().default("active"),
    expiresAt: ts("expires_at").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("holds_asset_idx").on(t.assetId, t.status)],
);

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  quoteId: integer("quote_id").references(() => quotes.id),
  versionId: integer("version_id").references(() => quoteVersions.id),
  title: text("title").notNull(),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  startDate: day("start_date").notNull(),
  endDate: day("end_date").notNull(),
  roNumber: text("ro_number"),
  roDate: day("ro_date"),
  advanceAmount: money("advance_amount"),
  paymentTerms: text("payment_terms"),
  ownerId: integer("owner_id").references(() => users.id),
  commissionPct: doublePrecision("commission_pct").notNull().default(0),
  total: money("total").notNull().default(0),
  notes: text("notes"),
  cancelReason: text("cancel_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const bookingLines = pgTable(
  "booking_lines",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    kind: lineKindEnum("kind").notNull().default("media"),
    assetId: integer("asset_id").references(() => assets.id),
    description: text("description"),
    startDate: day("start_date"),
    endDate: day("end_date"),
    mode: bookingModeEnum("mode"),
    slots: integer("slots"),
    amount: money("amount").notNull().default(0),
  },
  (t) => [index("booking_lines_asset_idx").on(t.assetId)],
);

export const bookingFiles = pgTable("booking_files", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").references(() => assets.id),
  kind: fileKindEnum("kind").notNull(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: text("number").unique(),
  kind: invoiceKindEnum("kind").notNull().default("tax"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  bookingId: integer("booking_id").references(() => bookings.id),
  issueDate: day("issue_date").notNull(),
  dueDate: day("due_date").notNull(),
  placeOfSupply: text("place_of_supply"),
  gross: money("gross").notNull().default(0),
  commissionPct: doublePrecision("commission_pct").notNull().default(0),
  commission: money("commission").notNull().default(0),
  taxable: money("taxable").notNull().default(0),
  cgst: money("cgst").notNull().default(0),
  sgst: money("sgst").notNull().default(0),
  igst: money("igst").notNull().default(0),
  total: money("total").notNull().default(0),
  notes: text("notes"),
  cancelReason: text("cancel_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const invoiceLines = pgTable("invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  sac: text("sac"),
  isMedia: boolean("is_media").notNull().default(true),
  amount: money("amount").notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
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
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const numberSeries = pgTable("number_series", {
  key: text("key").primaryKey(),
  next: integer("next").notNull().default(1),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  summary: text("summary").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
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
