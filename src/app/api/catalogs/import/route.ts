/**
 * POST /api/catalogs/import  (multipart/form-data)
 *   fields: file (CSV), vendor (string), delimiter? (override)
 *
 * Streams the uploaded CSV straight into the chunked importer (500-row batched UPSERT) so a
 * multi-megabyte distributor export never gets buffered whole into Lightsail memory.
 */

import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { NextResponse } from "next/server";

import { importCatalogCsv } from "@/lib/csv/importer";
import { getPresetForVendor } from "@/lib/catalog-queries";
import { errorMessage } from "@/lib/api-error";

export const runtime = "nodejs";
// Allow long-running streamed ingestion (Lightsail, not serverless).
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const vendor = String(form.get("vendor") ?? "").trim();
  const delimiterOverride = String(form.get("delimiter") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' upload." }, { status: 400 });
  }
  if (!vendor) {
    return NextResponse.json({ error: "Missing 'vendor'." }, { status: 400 });
  }

  const preset = await getPresetForVendor(vendor);
  if (!preset) {
    return NextResponse.json(
      { error: `No CSV preset for "${vendor}". Seed presets or add a mapping first.` },
      { status: 409 },
    );
  }

  const nodeStream = Readable.fromWeb(file.stream() as unknown as WebReadableStream<Uint8Array>);

  try {
    const result = await importCatalogCsv(nodeStream, {
      vendorName: vendor,
      columnMap: preset.columnMap,
      // Delimiter is auto-detected from the file header unless the uploader overrides it.
      delimiter: delimiterOverride || undefined,
      sourceFile: file.name,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
