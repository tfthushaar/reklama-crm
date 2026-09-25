const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Placeholder artwork for seeded documents and creatives. */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const name = new URL(req.url).searchParams.get("name") ?? "Document";
  const svg =
    kind === "creative"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c2d12"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
  <rect width="800" height="450" fill="url(#g)"/>
  <circle cx="620" cy="140" r="90" fill="#fde68a" opacity="0.35"/>
  <text x="60" y="200" font-family="Georgia, serif" font-size="54" font-weight="700" fill="#fff">${esc(name)}</text>
  <text x="60" y="250" font-family="Segoe UI, Arial" font-size="22" fill="#fff7ed">Festive collection · Visit our showrooms</text>
  <text x="60" y="400" font-family="Segoe UI, Arial" font-size="14" fill="#ffedd5">Sample creative</text>
</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780" viewBox="0 0 600 780">
  <rect width="600" height="780" fill="#fff"/><rect x="0" y="0" width="600" height="90" fill="#0f2640"/>
  <text x="40" y="56" font-family="Segoe UI, Arial" font-size="26" font-weight="700" fill="#fff">${esc(name)}</text>
  ${Array.from({ length: 14 }, (_, i) => `<rect x="40" y="${130 + i * 40}" width="${520 - (i % 3) * 90}" height="12" rx="6" fill="#e2e8f0"/>`).join("")}
  <text x="40" y="740" font-family="Segoe UI, Arial" font-size="14" fill="#94a3b8">Sample document</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
