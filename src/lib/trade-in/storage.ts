/**
 * Private on-disk storage for trade-in originals + JPEG thumbs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const MAX_EDGE = 1200;
const MAX_BYTES = 8 * 1024 * 1024;

export function tradeInRootDir(): string {
  const override = process.env.TRADE_IN_STORAGE_DIR?.trim();
  if (override) return override;
  // Prefer sibling of the SQLite file when DATABASE_URL is absolute (Lightsail volume).
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl.startsWith("file:")) {
    const dbPath = dbUrl.slice("file:".length);
    if (path.isAbsolute(dbPath)) {
      return path.join(path.dirname(dbPath), "trade-in");
    }
  }
  return path.join(process.cwd(), "data", "trade-in");
}

export function requestDir(requestId: string): string {
  return path.join(tradeInRootDir(), requestId);
}

export function absolutePhotoPath(requestId: string, storedName: string): string {
  const root = path.resolve(requestDir(requestId));
  const full = path.resolve(root, storedName);
  if (!full.startsWith(root + path.sep) && full !== root) {
    throw new Error("Invalid photo path");
  }
  return full;
}

export type SavedPhoto = {
  storedName: string;
  thumbName: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
};

export async function saveTradeInPhotos(
  requestId: string,
  files: { buffer: Buffer; originalName: string; mimeType: string }[],
): Promise<SavedPhoto[]> {
  const dir = requestDir(requestId);
  await mkdir(dir, { recursive: true });
  const out: SavedPhoto[] = [];
  let i = 0;
  for (const f of files) {
    if (f.buffer.byteLength > MAX_BYTES) {
      throw new Error(`Photo "${f.originalName}" exceeds 8MB limit`);
    }
    if (!f.mimeType.startsWith("image/")) {
      throw new Error(`File "${f.originalName}" is not an image`);
    }
    i += 1;
    const storedName = `full-${String(i).padStart(2, "0")}.jpg`;
    const thumbName = `thumb-${String(i).padStart(2, "0")}.jpg`;
    const fullBuf = await sharp(f.buffer)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    const thumbBuf = await sharp(f.buffer)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    await writeFile(path.join(dir, storedName), fullBuf);
    await writeFile(path.join(dir, thumbName), thumbBuf);
    out.push({
      storedName,
      thumbName,
      originalName: f.originalName.slice(0, 180),
      mimeType: "image/jpeg",
      byteSize: fullBuf.byteLength,
    });
  }
  return out;
}

export { MAX_BYTES as TRADE_IN_MAX_PHOTO_BYTES };
