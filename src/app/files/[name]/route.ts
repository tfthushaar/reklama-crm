import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storedFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { name } = await ctx.params;
  if (!/^[a-f0-9-]{36}\.[a-z0-9]+$/.test(name)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [f] = await db.select().from(storedFiles).where(eq(storedFiles.id, name));
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `${f.mime.startsWith("image/") || f.mime === "application/pdf" ? "inline" : "attachment"}; filename="${encodeURIComponent(f.name)}"`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
