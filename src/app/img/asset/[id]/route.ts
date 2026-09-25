import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assets } from "@/db/schema";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Generates a stylised placeholder "site photo" for a screen until real photos are uploaded. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const night = url.searchParams.get("v") === "night";
  const ad = url.searchParams.get("ad");
  const db = await getDb();
  const [a] = await db.select().from(assets).where(eq(assets.id, Number(id)));
  if (!a) return new Response("Not found", { status: 404 });

  const led = a.type === "led";
  const hue = (a.id * 47) % 360;
  const sky = night ? ["#0b1026", "#1b2450"] : ["#8ec5ff", "#dff0ff"];
  const ground = night ? "#1a1d24" : "#9aa3ad";
  const road = night ? "#23262e" : "#6b7280";
  const w = 800;
  const h = 500;
  const bw = led ? 380 : 440;
  const bh = led ? 200 : 190;
  const bx = (w - bw) / 2;
  const by = 70;
  const screenFill = ad
    ? `hsl(${hue} 70% ${night ? 45 : 50}%)`
    : led
      ? `url(#screen)`
      : night
        ? "#2a2f3a"
        : "#f4f4f5";
  const title = ad ?? (led ? "YOUR AD HERE" : "AVAILABLE");
  const sub = ad ? "Campaign live" : `${a.widthFt ?? ""}′ × ${a.heightFt ?? ""}′ ${led ? "LED" : "hoarding"}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 80% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360} 80% 45%)"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="hsl(${hue} 90% 70%)" stop-opacity="0.45"/><stop offset="1" stop-color="hsl(${hue} 90% 70%)" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  ${night ? Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 137) % w}" cy="${(i * 53) % 180}" r="1.2" fill="#fff" opacity="0.6"/>`).join("") : `<circle cx="680" cy="80" r="34" fill="#fff6c9" opacity="0.9"/>`}
  <g fill="${night ? "#141a33" : "#b7c4d3"}">
    <rect x="20" y="230" width="70" height="170"/><rect x="100" y="260" width="50" height="140"/><rect x="640" y="220" width="80" height="180"/><rect x="730" y="250" width="60" height="150"/>
  </g>
  ${night ? `<g fill="#f8d66d" opacity="0.7">${Array.from({ length: 24 }, (_, i) => `<rect x="${30 + (i % 4) * 14 + (i > 11 ? 620 : 0)}" y="${250 + Math.floor((i % 12) / 4) * 30}" width="6" height="9"/>`).join("")}</g>` : ""}
  <rect x="0" y="400" width="${w}" height="100" fill="${ground}"/>
  <path d="M0 460 L${w} 440 L${w} 500 L0 500 Z" fill="${road}"/>
  <path d="M0 478 L${w} 466" stroke="${night ? "#f5d76e" : "#fff"}" stroke-width="3" stroke-dasharray="30 24"/>
  ${led && night ? `<ellipse cx="${w / 2}" cy="${by + bh / 2}" rx="${bw}" ry="${bh}" fill="url(#glow)"/>` : ""}
  <rect x="${w / 2 - 10}" y="${by + bh}" width="20" height="${400 - by - bh}" fill="${night ? "#39404d" : "#4b5563"}"/>
  <rect x="${w / 2 - 70}" y="395" width="140" height="10" fill="${night ? "#39404d" : "#4b5563"}"/>
  <rect x="${bx - 8}" y="${by - 8}" width="${bw + 16}" height="${bh + 16}" rx="4" fill="${night ? "#2b303b" : "#374151"}"/>
  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${screenFill}"/>
  ${!led && night && !ad ? `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#fff" opacity="0.08"/>` : ""}
  <text x="${w / 2}" y="${by + bh / 2 - 4}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" fill="${ad || led ? "#fff" : night ? "#9ca3af" : "#6b7280"}">${esc(title)}</text>
  <text x="${w / 2}" y="${by + bh / 2 + 28}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="16" fill="${ad || led ? "#ffffffcc" : "#9ca3af"}">${esc(sub)}</text>
  <rect x="0" y="${h - 44}" width="${w}" height="44" fill="#0f2640" opacity="0.85"/>
  <text x="16" y="${h - 16}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="#fff">${esc(a.code)} · ${esc(a.name)}</text>
  <text x="${w - 16}" y="${h - 16}" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#cbd5e1">${night ? "Night view" : "Day view"} · sample image</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
