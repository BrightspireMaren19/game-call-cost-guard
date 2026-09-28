import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, runAssetReview, setAccountCeiling } from "./infrai_cost_client.js";
import { ceilingRequestSchema, chooseQueueLane, workflowRequestSchema } from "./workflow_decision.js";

const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method === "PUT" && request.url === "/account-ceiling") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = ceilingRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const ceiling = await setAccountCeiling(body.hardCapUsd, body.period);
      send(response, 200, { ceiling });
    } catch (error) {
      send(response, error instanceof InfraiError ? error.status : 400, { error: String(error) });
    }
    return;
  }

  if (request.method !== "POST" || request.url !== "/asset-review") {
    send(response, 404, { error: "route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = workflowRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const queueLane = chooseQueueLane(input);
    const receipt = await runAssetReview(input);
    send(response, 200, { workflowId: input.workflowId, queueLane, receipt });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      send(response, error.status, { error: error.code, detail: error.detail });
      return;
    }
    send(response, 502, { error: "upstream request failed" });
  }
}).listen(port, () => {
  console.log(`Game workflow service listening on http://localhost:${port}`);
});
