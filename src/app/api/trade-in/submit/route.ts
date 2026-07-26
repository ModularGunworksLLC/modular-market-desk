import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { tradeInPhotos, tradeInRequests } from "@/lib/db/schema";
import { estimateTradeInInterest } from "@/lib/trade-in/estimate";
import { ensureTradeInTables } from "@/lib/trade-in/ensure";
import { sendTradeInNotification, tradeInNotifyConfigured } from "@/lib/trade-in/notify";
import { clientIp, rateLimitOk } from "@/lib/trade-in/rate-limit";
import { saveTradeInPhotos, TRADE_IN_MAX_PHOTO_BYTES } from "@/lib/trade-in/storage";
import { turnstileConfigured, verifyTurnstile } from "@/lib/trade-in/turnstile";

export const runtime = "nodejs";

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (!rateLimitOk(`trade-in-submit:${ip}`, 8, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many submissions from this network. Try later." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const manufacturer = String(form.get("manufacturer") ?? "").trim();
  const model = String(form.get("model") ?? "").trim();
  const serialNumber = String(form.get("serialNumber") ?? "").trim();
  const caliber = String(form.get("caliber") ?? "").trim() || null;
  const customerName = String(form.get("customerName") ?? "").trim();
  const customerEmail = String(form.get("customerEmail") ?? "").trim();
  const customerPhone = String(form.get("customerPhone") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim() || null;
  const turnstileToken = String(form.get("turnstileToken") ?? "").trim() || null;

  if (!manufacturer || !model || !serialNumber || !customerName || !customerEmail || !customerPhone) {
    return NextResponse.json(
      { error: "Make, model, serial #, name, email, and phone are required." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (turnstileConfigured()) {
    const ok = await verifyTurnstile(turnstileToken, ip);
    if (!ok) {
      return NextResponse.json({ error: "Bot check failed — refresh and try again." }, { status: 400 });
    }
  }

  const uploads = form
    .getAll("photos")
    .filter((x): x is File => typeof File !== "undefined" && x instanceof File && x.size > 0);
  if (uploads.length < MIN_PHOTOS) {
    return NextResponse.json({ error: `Upload at least ${MIN_PHOTOS} photos.` }, { status: 400 });
  }
  if (uploads.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `At most ${MAX_PHOTOS} photos.` }, { status: 400 });
  }

  const buffers: { buffer: Buffer; originalName: string; mimeType: string }[] = [];
  for (const f of uploads) {
    const mime = f.type || "application/octet-stream";
    const name = f.name || "photo.jpg";
    if (!mime.startsWith("image/") && mime !== "application/octet-stream") {
      return NextResponse.json({ error: `"${name}" is not an image.` }, { status: 400 });
    }
    if (f.size > TRADE_IN_MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: `"${name}" exceeds 8MB.` }, { status: 400 });
    }
    const ab = await f.arrayBuffer();
    buffers.push({
      buffer: Buffer.from(ab),
      originalName: name,
      mimeType: mime.startsWith("image/") ? mime : "image/jpeg",
    });
  }

  await ensureTradeInTables();

  const estimate = await estimateTradeInInterest({
    manufacturer,
    model,
    caliber: caliber ?? undefined,
  });

  const requestId = randomUUID();
  const ua = request.headers.get("user-agent")?.slice(0, 400) ?? null;

  try {
    const saved = await saveTradeInPhotos(requestId, buffers);

    await db.insert(tradeInRequests).values({
      id: requestId,
      status: "submitted",
      manufacturer,
      model,
      serialNumber,
      caliber,
      customerName,
      customerEmail,
      customerPhone,
      notes,
      estimateP25: estimate.estimateP25,
      estimateSoldCount: estimate.soldCount,
      estimateLabel: estimate.label || null,
      oaModelId: estimate.oaModelId,
      oaCaliberId: estimate.oaCaliberId,
      notifySent: false,
      sourceIp: ip,
      userAgent: ua,
    });

    let sort = 0;
    for (const p of saved) {
      await db.insert(tradeInPhotos).values({
        id: randomUUID(),
        requestId,
        storedName: p.storedName,
        thumbName: p.thumbName,
        originalName: p.originalName,
        mimeType: p.mimeType,
        byteSize: p.byteSize,
        sortOrder: sort++,
      });
    }

    let notifyError: string | null = null;
    if (tradeInNotifyConfigured()) {
      try {
        await sendTradeInNotification({
          requestId,
          manufacturer,
          model,
          serialNumber,
          caliber,
          customerName,
          customerEmail,
          customerPhone,
          notes,
          estimateLabel: estimate.label || null,
          estimateP25: estimate.estimateP25,
          thumbs: saved.map((p) => ({ thumbName: p.thumbName, originalName: p.originalName })),
        });
        await db
          .update(tradeInRequests)
          .set({ notifySent: true, updatedAt: new Date() })
          .where(eq(tradeInRequests.id, requestId));
      } catch (err) {
        notifyError = err instanceof Error ? err.message : "Email failed";
        await db
          .update(tradeInRequests)
          .set({ notifyError, updatedAt: new Date() })
          .where(eq(tradeInRequests.id, requestId));
        console.error("[trade-in/submit] notify", err);
      }
    } else {
      notifyError = "Email not configured — request saved; check desk inbox.";
      await db
        .update(tradeInRequests)
        .set({ notifyError, updatedAt: new Date() })
        .where(eq(tradeInRequests.id, requestId));
    }

    return NextResponse.json({
      ok: true,
      id: requestId,
      estimateLabel: estimate.label || null,
      notifyQueued: !notifyError || notifyError.includes("not configured"),
      message:
        "Thanks — we received your request. We will contact you after reviewing the photos. This estimate is not a binding offer.",
    });
  } catch (err) {
    console.error("[trade-in/submit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submit failed" },
      { status: 500 },
    );
  }
}
