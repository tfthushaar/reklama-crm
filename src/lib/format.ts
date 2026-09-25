export const TZ = "Asia/Kolkata";

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN");

export function inr(paise: number | null | undefined): string {
  return inrFmt.format(Math.round((paise ?? 0) / 100));
}

export function inrShort(paise: number | null | undefined): string {
  const r = (paise ?? 0) / 100;
  const abs = Math.abs(r);
  if (abs >= 1e7) return `₹${trim(r / 1e7)} Cr`;
  if (abs >= 1e5) return `₹${trim(r / 1e5)} L`;
  if (abs >= 1e3) return `₹${trim(r / 1e3)}K`;
  return `₹${Math.round(r)}`;
}

function trim(n: number) {
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

export function num(n: number | null | undefined) {
  return numFmt.format(n ?? 0);
}

export function toPaise(v: FormDataEntryValue | string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toRupees(paise: number | null | undefined): number {
  return Math.round((paise ?? 0) / 100);
}

// ---------- dates ----------

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function parseDay(d: string) {
  return new Date(`${d}T00:00:00Z`);
}

export function addDays(d: string, n: number): string {
  const x = parseDay(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / 86400000) + 1;
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fy(d: string): string {
  const [y, m] = d.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function monthStart(d: string) {
  return `${d.slice(0, 7)}-01`;
}

export function monthEnd(d: string) {
  const x = parseDay(monthStart(d));
  x.setUTCMonth(x.getUTCMonth() + 1);
  x.setUTCDate(0);
  return x.toISOString().slice(0, 10);
}

export function fmtDay(d: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: opts.year === false ? undefined : "numeric",
    timeZone: "UTC",
  }).format(parseDay(d));
}

export function fmtRange(a: string | null | undefined, b: string | null | undefined): string {
  if (!a || !b) return "—";
  const sameYear = a.slice(0, 4) === b.slice(0, 4);
  return `${fmtDay(a, { year: !sameYear })} – ${fmtDay(b)}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(d));
}

export function dayOf(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
}

export function relTime(d: Date | string | null | undefined): string {
  if (!d) return "never";
  const diff = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  const mins = Math.round(abs / 60000);
  let s: string;
  if (mins < 1) return "just now";
  if (mins < 60) s = `${mins} min`;
  else if (mins < 60 * 24) s = `${Math.round(mins / 60)} h`;
  else {
    const days = Math.round(mins / 1440);
    s = days === 1 ? "1 day" : `${days} days`;
  }
  return past ? `${s} ago` : `in ${s}`;
}

export function dueLabel(d: Date | string): string {
  const day = dayOf(d);
  const t = today();
  if (day === t) return `Today, ${fmtTime(d)}`;
  if (day === addDays(t, 1)) return `Tomorrow, ${fmtTime(d)}`;
  if (day === addDays(t, -1)) return `Yesterday, ${fmtTime(d)}`;
  return fmtDateTime(d);
}

/** Combine an IST date (YYYY-MM-DD) and time (HH:MM) into a Date. */
export function istDateTime(day: string, time = "10:00"): Date {
  return new Date(`${day}T${time || "10:00"}:00+05:30`);
}

// ---------- words ----------

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

export function rupeesInWords(paise: number): string {
  let n = Math.round(paise / 100);
  if (n === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return `Rupees ${parts.join(" ")} Only`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
