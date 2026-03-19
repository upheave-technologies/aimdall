# Aimdall

LLM cost tracking dashboard. Polls usage data from OpenAI, Anthropic, and Google Vertex AI, normalizes it into Postgres, and displays cost breakdowns by provider, model, credential, and day.

## Setup

```bash
pnpm install
cp .env.example .env  # fill in your values
```

## Database

```bash
pnpm db:generate   # generate migration from schema
pnpm db:migrate    # apply migrations
pnpm db:reset      # drop everything, regenerate, and re-apply
pnpm db:studio     # open Drizzle Studio GUI
```

## Development

```bash
pnpm dev
```

Dashboard at [http://localhost:3000/cost-tracking](http://localhost:3000/cost-tracking).

## Syncing Usage Data

Trigger a sync via the API endpoint. The default window is the last 2 hours.

```bash
# Default sync (last 2 hours):
curl -X POST http://localhost:3000/api/cost-tracking/sync

# Backfill from a specific date:
curl -X POST http://localhost:3000/api/cost-tracking/sync \
  -H "Content-Type: application/json" \
  -d '{"startTime": "2026-03-01T00:00:00Z"}'

# With custom date range:
curl -X POST http://localhost:3000/api/cost-tracking/sync \
  -H "Content-Type: application/json" \
  -d '{"startTime": "2026-03-01T00:00:00Z", "endTime": "2026-03-15T00:00:00Z"}'

# With auth secret (if COST_TRACKING_SYNC_SECRET is set):
curl -X POST http://localhost:3000/api/cost-tracking/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SYNC_SECRET" \
  -d '{"startTime": "2026-03-01T00:00:00Z"}'
```

Re-running the same time range is safe -- records are upserted, not duplicated.

## Environment Variables

See `.env.example` for all available variables. Only `DATABASE_URL` and at least one provider key are required. Unconfigured providers are silently skipped.
