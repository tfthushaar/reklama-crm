import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/sheets";

const TEMPLATES: Record<string, (string | number)[][]> = {
  leads: [
    ["Company", "Contact", "Designation", "Phone", "Email", "Industry", "City", "Source", "Requirement", "Budget", "GSTIN"],
    ["Example Realty", "Ravi Kumar", "Marketing Manager", "9845012345", "ravi@example.com", "Real estate", "Bengaluru", "Referral", "Project launch near Hebbal", 500000, ""],
  ],
  screens: [
    ["Code", "Name", "Type", "City", "Area", "Address", "Width ft", "Height ft", "Resolution", "Illumination", "Sale mode", "Total slots", "Slot seconds", "Loop seconds", "Monthly rate", "Slot rate", "Daily traffic"],
    ["RG-BLR-101", "Example Junction LED", "LED", "Bengaluru", "Indiranagar", "100 Ft Road", 20, 10, "1920 x 960", "digital", "both", 12, 10, 120, 400000, 38000, 120000],
    ["RG-BLR-102", "Example Flyover Hoarding", "Hoarding", "Bengaluru", "Hebbal", "Bellary Road", 40, 20, "", "frontlit", "exclusive", 1, "", "", 250000, "", 200000],
  ],
};

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { kind } = await ctx.params;
  const rows = TEMPLATES[kind];
  if (!rows) return new Response("Not found", { status: 404 });
  return new Response("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-template.csv"` },
  });
}
