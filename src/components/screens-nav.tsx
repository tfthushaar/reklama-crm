import type { Asset } from "@/db/schema";
import { inr } from "@/lib/format";
import { Tabs } from "./ui";

export function ScreensNav({ active, counts }: { active: "list" | "availability" | "owners" | "maintenance"; counts?: { maintenance?: number } }) {
  return (
    <Tabs
      items={[
        { label: "All screens", href: "/screens", active: active === "list" },
        { label: "Availability calendar", href: "/screens/availability", active: active === "availability" },
        { label: "Site owners", href: "/screens/owners", active: active === "owners" },
        { label: "Maintenance", href: "/screens/maintenance", active: active === "maintenance", count: counts?.maintenance },
      ]}
    />
  );
}

export function saleSummary(a: Pick<Asset, "type" | "saleMode" | "totalSlots" | "slotSeconds" | "loopSeconds">) {
  if (a.type === "hoarding") return "Whole hoarding";
  const loop = `${a.totalSlots} slots of ${a.slotSeconds ?? "?"} seconds`;
  if (a.saleMode === "exclusive") return "Whole screen only";
  if (a.saleMode === "slots") return `${loop}, sold by slot`;
  return `${loop}, by slot or whole screen`;
}

export function priceSummary(a: Pick<Asset, "type" | "saleMode" | "monthlyRate" | "slotRate">) {
  const parts: string[] = [];
  if (a.type === "hoarding" || a.saleMode !== "slots") parts.push(`${inr(a.monthlyRate)} a month${a.type === "led" ? " for the whole screen" : ""}`);
  if (a.type === "led" && a.saleMode !== "exclusive" && a.slotRate) parts.push(`${inr(a.slotRate)} a month per slot`);
  return parts.join(", or ");
}

export function sizeSummary(a: Pick<Asset, "widthFt" | "heightFt" | "resolution">) {
  const size = a.widthFt && a.heightFt ? `${a.widthFt}′ × ${a.heightFt}′` : null;
  return [size, a.resolution].filter(Boolean).join(", ");
}
