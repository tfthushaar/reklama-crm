export type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple" | "teal";

export const ROLE_LABEL = {
  owner: "Owner",
  sales_manager: "Sales Manager",
  sales_exec: "Sales Executive",
  operations: "Operations",
  accounts: "Accounts",
} as const;

export const STAGES = [
  { key: "new", label: "New", tone: "gray" },
  { key: "contacted", label: "Contacted", tone: "blue" },
  { key: "qualified", label: "Qualified", tone: "teal" },
  { key: "meeting", label: "Meeting", tone: "purple" },
  { key: "proposal", label: "Proposal sent", tone: "amber" },
  { key: "negotiation", label: "Negotiation", tone: "amber" },
  { key: "won", label: "Won", tone: "green" },
  { key: "lost", label: "Lost", tone: "red" },
] as const satisfies readonly { key: string; label: string; tone: Tone }[];

export type StageKey = (typeof STAGES)[number]["key"];
export const OPEN_STAGES: StageKey[] = ["new", "contacted", "qualified", "meeting", "proposal", "negotiation"];

export function stageInfo(key: string) {
  return STAGES.find((s) => s.key === key) ?? STAGES[0];
}

export const CLIENT_TYPE_LABEL = {
  advertiser: "Brand",
  agency: "Agency",
  government: "Government",
} as const;

export const INDUSTRIES = [
  "Real estate",
  "Education",
  "Retail",
  "Jewellery",
  "FMCG",
  "Banking & finance",
  "Automobile",
  "Healthcare",
  "Film & entertainment",
  "Food & restaurants",
  "Fashion & apparel",
  "Telecom & tech",
  "Political",
  "Government",
  "Other",
];

export const LEAD_SOURCES = [
  "Referral",
  "Walk-in / inbound call",
  "Website",
  "Cold call",
  "Spotted on competitor site",
  "Agency",
  "Existing client",
  "Social media",
  "Event",
  "Imported list",
];

export const LOST_REASONS = [
  "Price too high",
  "Chose a competitor",
  "Budget cancelled",
  "Location not suitable",
  "Dates not available",
  "No response",
  "Other",
];

export const ACTIVITY_TYPES = {
  call: { label: "Call", tone: "blue" },
  whatsapp: { label: "WhatsApp", tone: "green" },
  email: { label: "Email", tone: "purple" },
  meeting: { label: "Meeting", tone: "amber" },
  note: { label: "Note", tone: "gray" },
  system: { label: "Update", tone: "teal" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const CALL_OUTCOMES = [
  "Interested",
  "Call back later",
  "Asked for quote",
  "Meeting fixed",
  "Not interested",
  "No answer",
  "Wrong number",
];

export const MESSAGE_OUTCOMES = ["Sent", "Replied", "Asked for quote", "Interested", "Not interested"];
export const MEETING_OUTCOMES = ["Good meeting", "Asked for quote", "Needs follow-up", "Not interested"];

export const QUOTE_STATUS = {
  draft: { label: "Draft", tone: "gray" },
  pending_approval: { label: "Needs approval", tone: "amber" },
  sent: { label: "Sent", tone: "blue" },
  accepted: { label: "Accepted", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  expired: { label: "Expired", tone: "gray" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const BOOKING_STEPS = [
  { key: "confirmed", label: "Confirmed", next: "Mark creative received" },
  { key: "creative_received", label: "Creative received", next: "Approve creative" },
  { key: "creative_approved", label: "Creative approved", next: "Mark as live" },
  { key: "live", label: "Live", next: "Mark completed" },
  { key: "completed", label: "Completed", next: null },
] as const;

export const BOOKING_STATUS = {
  confirmed: { label: "Confirmed", tone: "blue" },
  creative_received: { label: "Creative received", tone: "purple" },
  creative_approved: { label: "Creative approved", tone: "purple" },
  live: { label: "Live", tone: "green" },
  completed: { label: "Completed", tone: "gray" },
  cancelled: { label: "Cancelled", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const INVOICE_STATUS = {
  draft: { label: "Draft", tone: "gray" },
  issued: { label: "Unpaid", tone: "amber" },
  partial: { label: "Part paid", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
  cancelled: { label: "Cancelled", tone: "red" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const PAYMENT_MODES = ["Bank transfer", "UPI", "Cheque", "Cash", "Card"];

export const ASSET_TYPE_LABEL = { led: "LED screen", hoarding: "Hoarding" } as const;
export const SALE_MODE_LABEL = {
  exclusive: "Exclusive only",
  slots: "Slots only",
  both: "Slots or exclusive",
} as const;
export const ASSET_STATUS = {
  active: { label: "Active", tone: "green" },
  maintenance: { label: "Under maintenance", tone: "amber" },
  inactive: { label: "Inactive", tone: "gray" },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export const OWNERSHIP_LABEL = { owned: "Owned", leased: "Leased from site owner", third_party: "Third-party (resold)" } as const;

export const TICKET_STATUS = {
  open: { label: "Open", tone: "red" },
  in_progress: { label: "In progress", tone: "amber" },
  resolved: { label: "Resolved", tone: "green" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export const PRODUCTION_PRESETS = [
  { description: "Flex printing", rate: 1200 },
  { description: "Mounting", rate: 500000 },
  { description: "Creative design", rate: 1500000 },
  { description: "Video editing (LED)", rate: 1000000 },
];
