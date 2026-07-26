/**
 * Email trade-in submissions to the shop inbox with JPEG thumbs attached.
 */

import { readFile } from "node:fs/promises";

import nodemailer from "nodemailer";

import { absolutePhotoPath } from "@/lib/trade-in/storage";

export type TradeInMailPayload = {
  requestId: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  caliber: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string | null;
  estimateLabel: string | null;
  estimateP25: number | null;
  thumbs: { thumbName: string; originalName: string }[];
};

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      (process.env.TRADE_IN_NOTIFY_EMAIL?.trim() || process.env.NOTIFY_TO?.trim()),
  );
}

export function tradeInNotifyConfigured(): boolean {
  return smtpConfigured();
}

export async function sendTradeInNotification(payload: TradeInMailPayload): Promise<void> {
  if (!smtpConfigured()) {
    throw new Error("SMTP / TRADE_IN_NOTIFY_EMAIL not configured");
  }

  const to = (process.env.TRADE_IN_NOTIFY_EMAIL || process.env.NOTIFY_TO || "").trim();
  const from = (process.env.SMTP_FROM || process.env.SMTP_USER || "").trim();
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const deskBase = (process.env.PUBLIC_DESK_URL || "https://desk.modulargunworks.com").replace(/\/$/, "");
  const inboxUrl = `${deskBase}/trade-in/inbox?id=${encodeURIComponent(payload.requestId)}`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const lines = [
    `New trade-in request ${payload.requestId}`,
    "",
    `Firearm: ${payload.manufacturer} ${payload.model}`,
    payload.caliber ? `Caliber: ${payload.caliber}` : null,
    `Serial: ${payload.serialNumber}`,
    payload.estimateLabel ||
      (payload.estimateP25 != null ? `Estimate: ~$${payload.estimateP25.toFixed(2)}` : "Estimate: unavailable"),
    "",
    `Customer: ${payload.customerName}`,
    `Email: ${payload.customerEmail}`,
    `Phone: ${payload.customerPhone}`,
    payload.notes ? `Notes: ${payload.notes}` : null,
    "",
    `Inbox (full-res): ${inboxUrl}`,
    "",
    "Soft estimate only — not a binding offer.",
  ].filter((x): x is string => x != null);

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  let attachBudget = 9 * 1024 * 1024;
  for (const t of payload.thumbs.slice(0, 4)) {
    try {
      const buf = await readFile(absolutePhotoPath(payload.requestId, t.thumbName));
      if (buf.byteLength > attachBudget) continue;
      attachBudget -= buf.byteLength;
      attachments.push({
        filename: t.thumbName,
        content: buf,
        contentType: "image/jpeg",
      });
    } catch {
      /* skip missing thumb */
    }
  }

  await transporter.sendMail({
    from,
    to,
    subject: `[Trade-in] ${payload.manufacturer} ${payload.model} — ${payload.customerName}`,
    text: lines.join("\n"),
    attachments,
  });
}
