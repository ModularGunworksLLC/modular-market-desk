import { IdentifyError } from "@/lib/identify/errors";
import { geminiConfigured, identifyWithGemini } from "@/lib/identify/gemini";
import { identifyWithOpenAI, openaiConfigured } from "@/lib/identify/openai";
import type { IdentifyRequest, IdentifyResult } from "@/lib/identify/types";

export { IdentifyError } from "@/lib/identify/errors";
export { identifyWithGemini } from "@/lib/identify/gemini";
export { identifyWithOpenAI } from "@/lib/identify/openai";

/**
 * Identify firearm: Gemini first, then OpenAI on quota / missing Gemini key.
 */
export async function identifyFirearm(req: IdentifyRequest): Promise<IdentifyResult> {
  const prefer = (process.env.IDENTIFY_PROVIDER || "auto").toLowerCase();

  if (prefer === "openai") {
    if (!openaiConfigured()) throw new IdentifyError("OPENAI_API_KEY is not set.", 503);
    return identifyWithOpenAI(req);
  }
  if (prefer === "gemini") {
    return identifyWithGemini(req);
  }

  // auto
  if (geminiConfigured()) {
    try {
      return await identifyWithGemini(req);
    } catch (err) {
      if (err instanceof IdentifyError && (err.status === 429 || err.status === 503)) {
        if (openaiConfigured()) return identifyWithOpenAI(req);
        throw new IdentifyError(
          `${err.message} OpenAI fallback is not configured (set OPENAI_API_KEY in Desk .env).`,
          err.status,
        );
      }
      throw err;
    }
  }

  if (openaiConfigured()) {
    return identifyWithOpenAI(req);
  }

  throw new IdentifyError(
    "No vision provider configured. Set GEMINI_API_KEY and/or OPENAI_API_KEY in Desk .env.",
    503,
  );
}
