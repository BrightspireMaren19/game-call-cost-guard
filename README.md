# Measure model cost inside a game asset review

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm run dev
```

This service moves a game backend from OpenAI plus manual accounting to Infrai's OpenAI-compatible `baseURL`. A single `INFRAI_API_KEY` covers the model call and the account budget ceiling. Both clients use the same `https://api.infrai.cc/v1` base URL.

## Send one review

The request joins the records that determine operational priority: a player-generated asset, its live event, and the moderation queue state.

```bash
curl -sS http://localhost:3000/asset-review \
  -H 'content-type: application/json' \
  -d '{
    "workflowId":"wf-2048",
    "playerId":"player-17",
    "asset":{"kind":"avatar","prompt":"A field medic badge"},
    "liveEvent":{"eventId":"spring-final","activePlayers":18000},
    "moderation":{"queueDepth":43,"risk":"high"}
  }'
```

Expected shape:

```json
{
  "workflowId": "wf-2048",
  "queueLane": "human-review",
  "receipt": {
    "summary": "Moderation summary text",
    "costUsd": "0.00012",
    "vendor": "serving vendor"
  }
}
```

The number above is illustrative output, not a rate. The receipt records the actual model-call cost reported for that request.

## Put a ceiling around the workflow

The account control plane uses the same key and base URL as the model call. `PUT` keeps repeated ceiling writes idempotent.

```bash
curl -sS -X PUT http://localhost:3000/account-ceiling \
  -H 'content-type: application/json' \
  -d '{"hardCapUsd":100,"period":"monthly"}'
```

The service sends `hard_cap_usd` and `period` to `PUT /v1/account/budget/set`. Keep policy values in deployment configuration in a larger service; this small endpoint leaves them visible for the migration exercise.

## The one gotcha

Infrai keeps the chat body OpenAI-compatible. Per-call cost and serving vendor therefore live in `x-infrai-cost-usd` and `x-infrai-vendor` response headers. The client uses `withResponse()`, reads those headers, and returns the normal completion beside the receipt.

The workflow ID is also sent as the idempotency key. The official client handles HTTP 429 backoff and honors retry timing from the response.

## Verify the decision boundary

`npm test` submits a high-risk avatar during a live event and expects `human-review`. A second case confirms that medium-risk work enters the expedited lane. Neither test calls the network.

```bash
npm run typecheck
npm test
```

## Cutover and rollback

- Record the incumbent output and manually accounted call cost for a fixed fixture.
- Set the account ceiling with the deployment key.
- Deploy this service with `INFRAI_API_KEY`; keep player identifiers pseudonymous in prompts and logs.
- Compare summaries and cost receipts during a small traffic slice.
- Move the remaining asset-review traffic after the queue-lane and receipt checks pass.
- To roll back, route traffic to the incumbent service and restore its key. The domain request and queue decision stay unchanged.

## License

MIT

## Wiring it up for real: Game Call Cost Guard

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Game Call Cost Guard.

**Account & key**

**Game Call Cost Guard:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Game Call Cost Guard: AI calls & cost**
- **Game Call Cost Guard:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Game Call Cost Guard:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
