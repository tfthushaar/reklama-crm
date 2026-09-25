import "server-only";
import crypto from "node:crypto";
import path from "node:path";
import { getDb } from "@/db";
import { storedFiles } from "@/db/schema";
import { UserError } from "./services/common";

// Vercel rejects request bodies over ~4.5 MB, so uploads are capped just below that.
const MAX = 4 * 1024 * 1024;

export const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function saveUpload(file: File, opts: { imagesOnly?: boolean; userId?: number } = {}) {
  if (!file || file.size === 0) throw new UserError("Choose a file to upload.");
  if (file.size > MAX) throw new UserError("That file is larger than 4 MB. Please compress it or share a smaller version.");
  const ext = path.extname(file.name).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new UserError("That file type isn't supported. Use JPG, PNG, PDF, MP4 or Office files.");
  if (opts.imagesOnly && !mime.startsWith("image/")) throw new UserError("Please upload a photo (JPG or PNG).");
  const id = `${crypto.randomUUID()}${ext}`;
  const db = await getDb();
  await db.insert(storedFiles).values({
    id,
    name: file.name,
    mime,
    size: file.size,
    data: Buffer.from(await file.arrayBuffer()),
    uploadedBy: opts.userId ?? null,
  });
  return { url: `/files/${id}`, name: file.name };
}
