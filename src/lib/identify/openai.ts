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

function resolveModel(): string {
  return process.env.OPENAI_IDENTIFY_MODEL?.trim() || "gpt-4o-mini";
}

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function openaiConfigured(): boolean {
  return Boolean(getApiKey());
}

export async function identifyWithOpenAI(req: IdentifyRequest): Promise<IdentifyResult> {
  const key = getApiKey();
  if (!key) {
    throw new IdentifyError("OPENAI_API_KEY is not set.", 503);
  }
  if (!req.images?.length && !req.hintText?.trim()) {
    throw new IdentifyError("At least one photo or a title/hint text is required.");
  }
  if ((req.images?.length ?? 0) > MAX_IMAGES) {
    throw new IdentifyError(`Maximum ${MAX_IMAGES} photos per identify request.`);
  }

  const model = resolveModel();
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${IDENTIFY_SYSTEM}\n\nJSON schema:\n${IDENTIFY_JSON_SHAPE}\n\n${buildIdentifyUserText({
        gunType: req.gunType,
        hintText: req.hintText,
      })}`,
    },
  ];

  for (const img of req.images ?? []) {
    const data = stripDataUrl(img.dataBase64);
    const mimeRaw = (img.mimeType || "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
    const mime = mimeRaw === "image/jpg" ? "image/jpeg" : mimeRaw;
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${data}` },
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON matching the schema." },
        { role: "user", content },
      ],
    }),
  });

  const body = (await resp.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;

  if (!resp.ok) {
    throw new IdentifyError(body?.error?.message || `OpenAI HTTP ${resp.status}`, resp.status === 429 ? 429 : 502);
  }

  const text = body?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new IdentifyError("Empty OpenAI response.", 502);

  const parsed = identitySchema.safeParse(extractJsonObject(text));
  if (!parsed.success) {
    throw new IdentifyError(`Identity JSON failed validation: ${parsed.error.message}`, 502);
  }

  return toIdentifyResult(normalizeIdentity(parsed.data), `openai:${model}`);
}
