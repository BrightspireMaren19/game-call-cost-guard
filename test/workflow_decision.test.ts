import assert from "node:assert/strict";
import test from "node:test";
import { chooseQueueLane, workflowRequestSchema } from "../src/workflow_decision.js";

test("high-risk player assets enter human review during a live event", () => {
  const input = workflowRequestSchema.parse({
    workflowId: "wf-2048",
    playerId: "player-17",
    asset: { kind: "avatar", prompt: "A field medic badge" },
    liveEvent: { eventId: "spring-final", activePlayers: 18_000 },
    moderation: { queueDepth: 43, risk: "high" }
  });

  assert.equal(chooseQueueLane(input), "human-review");
});

test("large live events expedite medium-risk work", () => {
  const input = workflowRequestSchema.parse({
    workflowId: "wf-2049",
    playerId: "player-18",
    asset: { kind: "item", prompt: "A silver tournament shield" },
    liveEvent: { eventId: "spring-final", activePlayers: 18_000 },
    moderation: { queueDepth: 12, risk: "medium" }
  });

  assert.equal(chooseQueueLane(input), "expedited");
});
