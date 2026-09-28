import { z } from "zod";

export const workflowRequestSchema = z.object({
  workflowId: z.string().min(1),
  playerId: z.string().min(1),
  asset: z.object({
    kind: z.enum(["avatar", "item", "level"]),
    prompt: z.string().min(1).max(2_000)
  }),
  liveEvent: z.object({
    eventId: z.string().min(1),
    activePlayers: z.number().int().nonnegative()
  }),
  moderation: z.object({
    queueDepth: z.number().int().nonnegative(),
    risk: z.enum(["low", "medium", "high"])
  })
});

export const ceilingRequestSchema = z.object({
  hardCapUsd: z.number().positive(),
  period: z.string().min(1)
});

export type WorkflowRequest = z.infer<typeof workflowRequestSchema>;
export type QueueLane = "routine" | "expedited" | "human-review";

export function chooseQueueLane(input: WorkflowRequest): QueueLane {
  if (input.moderation.risk === "high") return "human-review";
  if (input.moderation.risk === "medium" || input.liveEvent.activePlayers >= 1_000) {
    return "expedited";
  }
  return "routine";
}
