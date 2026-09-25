import { daysBetween } from "./format";

export type MediaLineInput = {
  kind: "media";
  assetId: number;
  startDate: string;
  endDate: string;
  mode: "exclusive" | "slots";
  slots: number;
  rate: number; // paise per month per unit (whole screen, or one slot)
  discountPct: number;
};

export type ProductionLineInput = {
  kind: "production";
  description: string;
  qty: number;
  rate: number; // paise per unit
  discountPct: number;
};

export type LineInput = MediaLineInput | ProductionLineInput;

export type PricedLine = LineInput & { days: number | null; gross: number; amount: number };

export type Totals = {
  mediaGross: number;
  discountTotal: number;
  mediaNet: number;
  commissionPct: number;
  commission: number;
  production: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  maxDiscountPct: number;
};

export const roundRupee = (paise: number) => Math.round(paise / 100) * 100;

export function priceLine(line: LineInput): PricedLine {
  const disc = clampPct(line.discountPct);
  if (line.kind === "media") {
    const days = Math.max(1, daysBetween(line.startDate, line.endDate));
    const units = line.mode === "slots" ? Math.max(1, line.slots) : 1;
    const gross = roundRupee((line.rate * units * days) / 30);
    const amount = roundRupee(gross * (1 - disc / 100));
    return { ...line, discountPct: disc, days, gross, amount };
  }
  const gross = roundRupee(line.rate * (line.qty || 0));
  const amount = roundRupee(gross * (1 - disc / 100));
  return { ...line, discountPct: disc, days: null, gross, amount };
}

export function clampPct(p: number) {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, p));
}

export function splitGst(taxable: number, gstRate: number, interState: boolean) {
  if (interState) {
    return { cgst: 0, sgst: 0, igst: roundRupee((taxable * gstRate) / 100) };
  }
  const half = roundRupee((taxable * gstRate) / 200);
  return { cgst: half, sgst: half, igst: 0 };
}

export function computeTotals(
  lines: PricedLine[],
  opts: { commissionPct: number; gstRate: number; interState: boolean },
): Totals {
  let mediaGross = 0;
  let mediaNet = 0;
  let production = 0;
  let discountTotal = 0;
  let maxDiscountPct = 0;
  for (const l of lines) {
    discountTotal += l.gross - l.amount;
    maxDiscountPct = Math.max(maxDiscountPct, l.discountPct);
    if (l.kind === "media") {
      mediaGross += l.gross;
      mediaNet += l.amount;
    } else {
      production += l.amount;
    }
  }
  const commissionPct = clampPct(opts.commissionPct);
  const commission = roundRupee((mediaNet * commissionPct) / 100);
  const taxable = mediaNet - commission + production;
  const gst = splitGst(taxable, opts.gstRate, opts.interState);
  return {
    mediaGross,
    discountTotal,
    mediaNet,
    commissionPct,
    commission,
    production,
    taxable,
    ...gst,
    total: taxable + gst.cgst + gst.sgst + gst.igst,
    maxDiscountPct,
  };
}

export type InvoiceLineInput = { description: string; amount: number; isMedia: boolean };

/** Agency commission applies to media lines only; GST applies to the net. */
export function invoiceTotals(lines: InvoiceLineInput[], commissionPct: number, gstRate: number, interState: boolean) {
  const gross = lines.reduce((s, l) => s + l.amount, 0);
  const media = lines.filter((l) => l.isMedia).reduce((s, l) => s + l.amount, 0);
  const commission = roundRupee((media * commissionPct) / 100);
  const taxable = gross - commission;
  const gst = splitGst(taxable, gstRate, interState);
  return { gross, commission, taxable, ...gst, total: taxable + gst.cgst + gst.sgst + gst.igst };
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const m = /^(\d{2})[A-Z0-9]{13}$/i.exec(gstin.trim());
  return m ? m[1]! : null;
}

export function isInterState(companyStateCode: string | null | undefined, client: { stateCode?: string | null; gstin?: string | null }) {
  const clientCode = client.stateCode || stateCodeFromGstin(client.gstin);
  if (!companyStateCode || !clientCode) return false;
  return companyStateCode !== clientCode;
}

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

export function stateName(code: string | null | undefined) {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? null;
}
