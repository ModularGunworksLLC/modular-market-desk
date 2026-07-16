import { IdentifyError } from "@/lib/identify/errors";
import {
  extractJsonObject,
  identitySchema,
  normalizeIdentity,
  stripDataUrl,
  toIdentifyResult,
} from "@/lib/identify/parse";
import { buildIdentifyUserText, IDENTIFY_JSON_SHAPE, IDENTIFY_SYSTEM } from "@/lib/identify/prompt";
import type { IdentifyRequest, IdentifyResult } from "@/lib/identify/types";

const MAX_IMAGES = 8;
const MAX_BYTES_PER_IMAGE = 8 * 1024 * 1024;

function resolveModel(): string {
  return (
    process.env.GEMINI_APPRAISE_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-2.0-flash"
  );
}

function getApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export function geminiConfigured(): boolean {
  return Boolean(getApiKey());
}

export async function identifyWithGemini(req: IdentifyRequest): Promise<IdentifyResult> {
  const key = getApiKey();
  if (!key) {
    throw new IdentifyError(
      "GEMINI_API_KEY is not set. Add it to Desk .env or set OPENAI_API_KEY as fallback.",
      503,
    );
  }

  if (!req.images?.length && !req.hintText?.trim()) {
    throw new IdentifyError("At least one photo or a title/hint text is required.");
  }
  if ((req.images?.length ?? 0) > MAX_IMAGES) {
    throw new IdentifyError(`Maximum ${MAX_IMAGES} photos per identify request.`);
  }

  const model = resolveModel();
  const parts: Array<Record<string, unknown>> = [
    {
      text: `${IDENTIFY_SYSTEM}\n\nJSON schema:\n${IDENTIFY_JSON_SHAPE}\n\n${buildIdentifyUserText({
        gunType: req.gunType,
        hintText: req.hintText,
      })}`,
    },
  ];

  for (const img of req.images ?? []) {
    const data = stripDataUrl(img.dataBase64);
    if (!data) throw new IdentifyError("Empty image payload.");
    const approxBytes = Math.floor((data.length * 3) / 4);
    if (approxBytes > MAX_BYTES_PER_IMAGE) {
      throw new IdentifyError("One photo exceeds 8MB — resize and retry.");
    }
    const mimeRaw = (img.mimeType || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mimeRaw)) {
      throw new IdentifyError(`Unsupported image type: ${mimeRaw}`);
    }
    parts.push({
      inline_data: {
        mime_type: mimeRaw === "image/jpg" ? "image/jpeg" : mimeRaw,
        data,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  const body = (await resp.json().catch(() => null)) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null;

  if (!resp.ok) {
    const msg = body?.error?.message || `Gemini HTTP ${resp.status}`;
    if (/quota|rate.?limit|resource.?exhausted/i.test(msg)) {
      throw new IdentifyError(
        "Gemini quota exhausted. Enable billing + new key, or set OPENAI_API_KEY for fallback. " +
          "https://aistudio.google.com/apikey",
        429,
      );
    }
    throw new IdentifyError(msg, resp.status >= 500 ? 502 : resp.status === 429 ? 429 : 400);
  }

  let text = "";
  for (const part of body?.candidates?.[0]?.content?.parts ?? []) {
    if (part.text) text += part.text;
  }
  text = text.trim();
  if (!text) throw new IdentifyError("Empty Gemini response.", 502);

  const parsed = identitySchema.safeParse(extractJsonObject(text));
  if (!parsed.success) {
    throw new IdentifyError(`Identity JSON failed validation: ${parsed.error.message}`, 502);
  }

  return toIdentifyResult(normalizeIdentity(parsed.data), `gemini:${model}`);
}
