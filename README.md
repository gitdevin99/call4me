# Call for me

A responsive, installable messaging PWA for an AI calling concierge. Built with React, TypeScript, Vite, Express, and optional Supabase authentication and cloud saving.

## Run locally

Requires Node 22.13+.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. For a production build:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3001. The production build includes a generated service worker, web manifest, 192px and 512px icons, and an Apple touch icon. Install from a supported browser on localhost or HTTPS. iOS uses Safari → Share → Add to Home Screen.

## Implemented

- Responsive desktop messenger and mobile navigation, conversational task preparation, editable call plans, search, and conversation filters.
- Explicitly labelled 24-second simulated calls, progress, cancellation, result cards, transcript export, and calendar export.
- Prepaid preview wallet with manual $5/$10/$20 reloads, per-second usage, spending caps, and transaction history. No subscriptions or automatic reloads.
- Local persistence, offline app shell, update notification, data export, profile editing, and reset.
- Supabase email magic-link sign-in and private account storage, when configured.
- Authenticated, rate-limited OpenRouter chat endpoint with server-only credentials and input validation, when configured.

## Connect Supabase and OpenRouter

1. Create a Supabase project and execute `supabase/schema.sql` in its SQL editor. Row-level security restricts preview state to its owner.
2. Copy `.env.example` to `.env`. Add your Supabase URL and public anonymous/publishable key to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Configure Supabase Auth Site URL and redirect allowlist for your development URL and eventual HTTPS domain. Enable email sign-in and configure production SMTP before launch.
4. Put a newly rotated OpenRouter key in `OPENROUTER_API_KEY`. The key previously pasted into chat was intentionally not stored or used. Choose `OPENROUTER_MODEL` appropriate to your account; the default is `openai/gpt-4.1-mini`.
5. Restart the server and rebuild after changing `VITE_` values. Sign in via Profile. Cloud state starts separately for a new account; guest conversations are not silently imported.

Only `VITE_` values are included in the client bundle. Never put a secret API key or Supabase service-role key in a `VITE_` variable. `.env` is gitignored. The server verifies each supplied Supabase token using `getUser`; guest requests cannot use the paid model endpoint. OpenRouter receives the signed-in user's submitted conversation, limited to 24 messages.

## Current capability boundary

**This is a working PWA and an interactive product preview, not a live calling/payment service.** Google Places, OpenAI and Twilio credentials have now been validated, and Supabase Auth plus private preview storage are configured. Payment processing and the live voice runtime are still missing. There are no actual calls, charges, or bookings. Demo numbers use the fictional US 555-01xx range. The browser-editable preview wallet must never become the source of truth for real money.

To launch live calling, implement a trusted backend ledger and provider integration first: payment webhooks with signature verification and idempotency; atomic credit reservations; provider-owned call lifecycle and metering; verified call callbacks; retry deduplication; spending limits enforced server-side; country-specific calling support; explicit user approval of call details; AI identification and relevant recording/consent behavior. Live provider status must replace the simulated timer. A text-model key alone cannot connect to the telephone network.

Supabase `preview_states` deliberately stores only disposable preview data. Its client-writable state and balances are unsuitable for real billing. Session and preview state are stored in this browser; sign out before sharing a device. Profile export downloads preview state only; account deletion is not implemented.

The server binds to loopback by default. For deployment, run it behind an HTTPS reverse proxy with process supervision. Set a durable per-user/global rate limit before public paid-model access; the current per-IP limiter is process-local. Do not blindly enable Express `trust proxy` without configuring the exact proxy topology.

## Validation

```sh
npm test
npm run build
```

Tests cover duplicate settlement, elapsed-time cancellation, background timer delay, zero-balance and maximum-spend handling, calendar escaping, input-size limits, and rejection of client-supplied system messages. See `docs/QA.md` for browser verification and remaining external checks.

## Conversation-first preparation (October 1 update)

The mandatory call-details modal has been removed. Type a complete request, select a branch in the chat, and review a compact preview card. Follow-up messages update the request; booking questions are asked individually only when missing. Informational calls need no date, guest count, or booking name. A small local parser supports the unconfigured demo; authenticated OpenRouter extraction supports broader natural language when connected.

The microphone records up to 60 seconds with playback and discard. The microphone now sits inside the composer. Recording expands into a timer, waveform, pause/resume, delete and send controls. Sent recordings are stored in IndexedDB on the sending device, and their transcripts appear in the chat. The server uses direct OpenAI transcription when configured, with OpenRouter as the alternative. Audio is not uploaded to Supabase. Actual microphone capture and paid transcription require device testing and configured credentials; no audio was sent during implementation.

- `GOOGLE_PLACES_API_KEY`: enable Places API (New). Text Search retrieves matching businesses; selecting one retrieves its phone. Full google.com Maps links with a place path or query are supported. Short maps.app.goo.gl links currently ask for a business name/city instead of following arbitrary redirects. Google results have attribution and source links. Search content is kept out of local/cloud persistence; saved requests can re-query.
- `BRAVE_SEARCH_API_KEY`: optional web-search fallback. Web results link to sources; they are not treated as verified phone numbers or automatically dialed.
- Without Google credentials, the branch cards are explicitly labelled fictional examples. Provider failures never silently become fabricated search results.
- API routes under `/api/concierge` require verified Supabase sessions and enforce input/rate limits. No credential values are exposed through health checks.

## Twilio and Telnyx

Both backend adapters are included. Set `TELEPHONY_PROVIDER=twilio` (default) or `telnyx`. `server/telephony.mjs` gives both a common `dial` / `hangup` interface. Provider choice stays out of the customer UI. There is **no automatic cross-provider fallback**, which could duplicate a paid call after an ambiguous timeout.

Twilio uses the account SID, auth token, sender number, and public HTTPS voice/status callback URLs in `.env.example`. Its adapter creates a call with a reserved-budget time limit and uses Twilio's official signature validator. The voice URL must serve a real AI voice bridge, which is not yet implemented here. A reservation ID links the callbacks; durable creation deduplication belongs in the future trusted ledger.

Telnyx uses an API key, Call Control connection, sender number and assistant ID. Its adapter includes outbound dialing, starting the configured assistant after answer, hangup, command IDs and Ed25519 signature verification. Durable webhook event processing is still required.

**Adapters are implemented and contract-tested with mocks, not activated.** `/api/concierge/calls` deliberately rejects live dialing. Before activation, implement payment-backed credit reservations, durable signed webhook processing, actual AI voice runtime integration, billing settlement, and provider account setup. Merely adding keys does not unlock paid calls. The preview wallet remains entirely simulated.

References: [Twilio calls](https://www.twilio.com/docs/voice/api/call-resource), [Twilio webhook validation](https://www.twilio.com/docs/usage/webhooks/webhooks-security), [Telnyx SDK call contract](https://github.com/team-telnyx/telnyx-node/blob/master/src/resources/calls/calls.ts), [Google Places](https://developers.google.com/maps/documentation/places/web-service/text-search), [Google attribution/storage policies](https://developers.google.com/maps/documentation/places/web-service/policies), [OpenRouter transcription](https://openrouter.ai/blog/tutorials/transcription-on-openrouter/).
