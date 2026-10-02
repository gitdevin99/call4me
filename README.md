# Can You Call

A React/TypeScript PWA with an Express server, Supabase sign-in, Google Places business discovery, Twilio/OpenAI Realtime calls, and one-time Whop credit reloads.

## Development

Use Node 22.13+. Copy `.env.example` to `.env`, install with `npm ci`, then run `npm run dev`. Build with `npm run build`; `npm start` serves the built app and API. Run `npm test` for contract, intent, billing, and webhook-signature tests.

## Production architecture

- Supabase authenticates users through the Google popup sign-in flow. The public client ID is built into the frontend; its secret stays in Supabase. See [Google sign-in setup](docs/google-signin.md) for device QA and environment details.
- `public.preview_states` stores owner-scoped conversation state for compatibility. Its browser-editable balance fields are never trusted for money.
- `supabase/live.sql` defines private `callapp` wallets, orders, ledger, calls, and payment jobs. Only the server database role accesses these tables. The deployed runtime role uses explicit schema/table grants and RLS policies.
- Google Places supplies business matches and verified phone numbers. The assistant extracts the business from the request and asks only for missing details.
- Twilio caller numbers come from the owned voice-capable inventory, refreshed every minute. Selection prefers the destination country. The country catalog distinguishes numbers available to purchase from owned numbers; it does not purchase automatically.
- Each call requires user approval, an authoritative price quote, and an atomic credit reservation. Twilio enforces a duration limit. Signed callbacks and reconciliation settle actual duration once.
- OpenAI Realtime streams telephone audio through `/api/voice/stream`. The assistant identifies itself as AI and asks permission to continue with transcription.
- Whop creates one-time $5/$10/$20 checkouts. Signed webhook events enter a durable queue; the worker fetches the authoritative payment and validates its company, order, checkout, currency, and amount before updating credit. Refunds/disputes reconcile the credit. There are no subscriptions or automatic reloads.

## Deployment

See [Render setup](docs/RENDER.md). Set `PUBLIC_ORIGIN`, server credentials, the restricted `DATABASE_URL`, and `WHOP_WEBHOOK_SECRET`. Keep `.env*` files out of Git. Only Supabase public configuration uses `VITE_` names. `CALLS_ENABLED` and `PAYMENTS_ENABLED` control activation.

Whop endpoint: `https://canyoucall.app/api/webhooks/whop`. Events: `payment.succeeded`, `payment.failed`, `refund.created`, `refund.updated`, `dispute.created`, `dispute.updated`.

## Verification boundaries

Health flags indicate configured/enabled services, not end-to-end success. Verify email delivery, a paid reload, and an authorized phone call before declaring launch readiness. Test callbacks are not real payments. No call is made automatically by deployment.

The active voice runtime uses Twilio. The legacy Telnyx adapter is not wired into live billing. Human takeover, listen-in, automatic phone-menu navigation, and purchasing numbers in the app are not implemented. A provider timeout during dialing keeps the credit reservation pending to avoid duplicate calls; unresolved cases require operator reconciliation.

### Persistent memory

Supermemory uses the server-only `SUPERMEMORY_API_KEY`. Apply
`supabase/migrations/20261002_memory.sql` with the database administrator before
deploying; the runtime role only reads/writes the new memory tables.
Each verified Supabase user has a separate, server-derived container tag. New
chat exchanges and reviewed call outcomes enter a durable retry queue. Retrieval
combines the profile, relevant memories, and recent saved exchanges; provider
failures do not prevent ordinary chat. No automatic historical backfill occurs.
Profile lets users view, correct, pause, or clear memory. Clearing rotates its
namespace immediately, removes local memory events, and queues old-container
deletion. Original chats and financial/call records remain separate.

Run `npm test` for unit checks. `node --env-file=.env scripts/verify-memory.mjs`
is an opt-in provider/database check requiring an admin database password. It
creates and removes two synthetic test users, verifies fresh-chat contact recall,
isolation, pause and reset, and never places a phone call.
