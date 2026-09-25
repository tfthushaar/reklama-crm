const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Greyscale placeholder artwork for seeded documents and creatives. */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const name = new URL(req.url).searchParams.get("name") ?? "Document";
  const svg =
    kind === "creative"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="#111"/>
  <circle cx="640" cy="130" r="96" fill="#fff" fill-opacity="0.06"/>
  <text x="60" y="210" font-family="Helvetica Neue, Arial, sans-serif" font-size="52" font-weight="600" letter-spacing="-1" fill="#fff">${esc(name)}</text>
  <text x="60" y="255" font-family="Helvetica Neue, Arial, sans-serif" font-size="20" fill="#fff" fill-opacity="0.65">Festive collection. Visit our showrooms.</text>
  <text x="60" y="405" font-family="Helvetica Neue, Arial, sans-serif" font-size="13" fill="#fff" fill-opacity="0.4">Sample creative</text>
</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="780" viewBox="0 0 600 780">
  <rect width="600" height="780" fill="#fff"/>
  <text x="48" y="88" font-family="Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="600" fill="#111">${esc(name)}</text>
  ${Array.from({ length: 14 }, (_, i) => `<rect x="48" y="${136 + i * 40}" width="${504 - (i % 3) * 90}" height="10" rx="5" fill="#ececec"/>`).join("")}
  <text x="48" y="740" font-family="Helvetica Neue, Arial, sans-serif" font-size="13" fill="#9a9a9a">Sample document</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
