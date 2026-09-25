import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assets } from "@/db/schema";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A quiet, greyscale placeholder "site photo" for a screen until real photos are uploaded. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const night = url.searchParams.get("v") === "night";
  const ad = url.searchParams.get("ad");
  const db = await getDb();
  const [a] = await db.select().from(assets).where(eq(assets.id, Number(id)));
  if (!a) return new Response("Not found", { status: 404 });

  const led = a.type === "led";
  const w = 800;
  const h = 500;
  const p = night
    ? { sky: ["#141414", "#232323"], far: "#1d1d1d", near: "#2a2a2a", ground: "#191919", road: "#222", mast: "#3a3a3a", frame: "#303030", window: "#4a4a4a" }
    : { sky: ["#f4f4f4", "#e9e9e9"], far: "#dedede", near: "#d2d2d2", ground: "#cfcfcf", road: "#bcbcbc", mast: "#8a8a8a", frame: "#6f6f6f", window: "#e9e9e9" };
  const bw = led ? 360 : 420;
  const bh = led ? 196 : 188;
  const bx = (w - bw) / 2;
  const by = 78;
  const screenFill = ad ? "#111" : led ? (night ? "#f5f5f5" : "#1a1a1a") : night ? "#3b3b3b" : "#fbfbfb";
  const textFill = ad ? "#fff" : led ? (night ? "#111" : "#fff") : night ? "#9a9a9a" : "#8a8a8a";
  const title = ad ?? (led ? "Your message here" : "Available");
  const sub = ad ? "Campaign live" : `${a.widthFt ?? ""} × ${a.heightFt ?? ""} ft ${led ? "LED" : "hoarding"}`;

  const buildings = [
    [20, 250, 80, 150, p.far],
    [110, 285, 56, 115, p.near],
    [620, 238, 86, 162, p.far],
    [712, 272, 68, 128, p.near],
  ]
    .map(([x, y, bwid, bht, f]) => `<rect x="${x}" y="${y}" width="${bwid}" height="${bht}" fill="${f}"/>`)
    .join("");
  const windows = night
    ? Array.from({ length: 18 }, (_, i) => `<rect x="${34 + (i % 3) * 20 + (i > 8 ? 598 : 0)}" y="${268 + Math.floor((i % 9) / 3) * 30}" width="7" height="10" fill="${p.window}"/>`).join("")
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  ${buildings}${windows}
  <rect x="0" y="400" width="${w}" height="100" fill="${p.ground}"/>
  <rect x="0" y="452" width="${w}" height="48" fill="${p.road}"/>
  ${led && night ? `<ellipse cx="${w / 2}" cy="${by + bh / 2}" rx="${bw}" ry="${bh}" fill="url(#glow)"/>` : ""}
  <rect x="${w / 2 - 9}" y="${by + bh}" width="18" height="${400 - by - bh}" fill="${p.mast}"/>
  <rect x="${bx - 7}" y="${by - 7}" width="${bw + 14}" height="${bh + 14}" rx="3" fill="${p.frame}"/>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${screenFill}"/>
  <text x="${w / 2}" y="${by + bh / 2}" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="28" font-weight="600" letter-spacing="-0.5" fill="${textFill}">${esc(title)}</text>
  <text x="${w / 2}" y="${by + bh / 2 + 30}" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="15" fill="${textFill}" fill-opacity="0.7">${esc(sub)}</text>
  <text x="20" y="${h - 18}" font-family="Helvetica Neue, Arial, sans-serif" font-size="14" fill="${night ? "#8a8a8a" : "#6f6f6f"}">${night ? "Night" : "Day"} · sample image</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
