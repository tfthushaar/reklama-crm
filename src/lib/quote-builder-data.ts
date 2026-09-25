import "server-only";
import { asc, eq, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { assetPhotos, assets, clients, type User } from "@/db/schema";
import type { AssetOpt, ClientOpt } from "@/components/quote-builder";
import { discountLimit } from "./permissions";
import { isInterState } from "./pricing";
import { getSettings } from "./services/common";

export async function builderData(db: DB, user: User) {
  const settings = await getSettings(db);
  const photos = await db
    .select({ assetId: assetPhotos.assetId, url: sql<string>`min(${assetPhotos.url})` })
    .from(assetPhotos)
    .where(eq(assetPhotos.kind, "day"))
    .groupBy(assetPhotos.assetId);
  const photoOf = new Map(photos.map((p) => [p.assetId, p.url]));
  const assetRows = await db.select().from(assets).where(ne(assets.status, "inactive")).orderBy(asc(assets.code));
  const assetOpts: AssetOpt[] = assetRows.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    area: a.area,
    saleMode: a.saleMode,
    totalSlots: a.totalSlots,
    slotSeconds: a.slotSeconds,
    monthlyRate: Math.round(a.monthlyRate / 100),
    slotRate: a.slotRate ? Math.round(a.slotRate / 100) : null,
    minDays: a.minDays,
    dailyTraffic: a.dailyTraffic,
    widthFt: a.widthFt,
    heightFt: a.heightFt,
    photo: photoOf.get(a.id) ?? null,
    maintenance: a.status === "maintenance",
  }));
  const clientRows = await db.select().from(clients).where(ne(clients.stage, "lost")).orderBy(asc(clients.name));
  const clientOpts: ClientOpt[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    agencyCommission: c.agencyCommission,
    interState: isInterState(settings.stateCode, c),
  }));
  return { settings, assetOpts, clientOpts, limit: discountLimit(user.role, settings) };
}
