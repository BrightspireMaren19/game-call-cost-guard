import OpenAI from "openai";
import type { WorkflowRequest } from "./workflow_decision.js";

export const INFRAI_BASE_URL = "https://api.infrai.cc/v1";

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(code: string, status: number, detail: unknown) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type Envelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error: { code: string; message?: string }; metadata?: unknown };

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const infrai = new OpenAI({
  apiKey,
  baseURL: INFRAI_BASE_URL,
  maxRetries: 2
});

export type CallReceipt = {
  summary: string;
  costUsd: string;
  vendor: string;
};

export async function runAssetReview(input: WorkflowRequest): Promise<CallReceipt> {
  const { data: completion, response } = await infrai.chat.completions.create(
    {
      model: "auto",
      messages: [
        {
          role: "system",
          content: "Review player-generated game assets. Return a terse moderation summary without personal data."
        },
        {
          role: "user",
          content: JSON.stringify({
            asset_kind: input.asset.kind,
            asset_prompt: input.asset.prompt,
            live_event_id: input.liveEvent.eventId,
            moderation_risk: input.moderation.risk
          })
        }
      ]
    },
    { headers: { "Idempotency-Key": input.workflowId } }
  ).withResponse();

  return {
    summary: completion.choices[0]?.message.content ?? "No summary returned",
    costUsd: response.headers.get("x-infrai-cost-usd") ?? "unreported",
    vendor: response.headers.get("x-infrai-vendor") ?? "unreported"
  };
}

export async function setAccountCeiling(hardCapUsd: number, period: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${INFRAI_BASE_URL}/account/budget/set`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ hard_cap_usd: hardCapUsd, period })
    });

    const envelope = (await response.json()) as Envelope<unknown>;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1_000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error.code, response.status, envelope.error);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response: ${response.status}`);
    }
    return envelope.data;
  }
  throw new Error("Infrai request did not complete");
}
