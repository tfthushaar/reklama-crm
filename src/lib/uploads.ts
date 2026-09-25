import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UserError } from "./services/common";

export const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");
const MAX = 15 * 1024 * 1024;

export const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function saveUpload(file: File, opts: { imagesOnly?: boolean } = {}) {
  if (!file || file.size === 0) throw new UserError("Choose a file to upload.");
  if (file.size > MAX) throw new UserError("That file is larger than 15 MB.");
  const ext = path.extname(file.name).toLowerCase();
  if (!MIME[ext] || ext === ".svg") throw new UserError("That file type isn't supported. Use JPG, PNG, PDF, MP4 or Office files.");
  if (opts.imagesOnly && !MIME[ext]!.startsWith("image/")) throw new UserError("Please upload a photo (JPG or PNG).");
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const stored = `${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));
  return { url: `/files/${stored}`, name: file.name };
}
