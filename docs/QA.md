# Verification

## Automated

- TypeScript and Vite production build.
- 8 tests: duplicate settlement, cancellation metering, delayed background timer settlement, zero balance/spending cap, calendar escaping, API system-role rejection, message/history size validation, and valid conversation handling.
- Dependency installation audit: zero vulnerabilities at implementation time.
- API health returns explicit disconnected states without credentials.
- Unconfigured model endpoint fails closed with HTTP 503.

## Browser checks

- Served production build renders desktop two-pane messenger and responsive 390px mobile conversation.
- Started and completed a 24-second simulated call. Preview balance changed from $8.40 to $8.28 with one $0.12 ledger entry.
- Added $10 of preview credit; balance changed to $18.28 and a single matching top-up appeared.
- Started a new conversation, sent a request, edited the business/phone details, and saved a ready call card.
- Verified the profile and magic-link dialog correctly disclose that Supabase is not connected.
- Confirmed an activated service worker on the production origin.
- Emulated an offline network, reloaded successfully from the cached app shell, and saw saved conversations plus the offline notice. Restored connectivity afterward.
- Confirmed a new build triggers the update prompt and the Update app button loads the new version.
- Reset only the synthetic browser test data to the initial examples and restored the default desktop viewport.
- Captured screenshots in `docs/screenshots/`.
- Final browser error log: no errors.

## Not verified without external accounts

- Supabase email delivery, hosted RLS execution, OAuth redirect, and cross-device cloud sync.
- Live OpenRouter model response; no exposed key was used.
- Telephone calls and payment settlement are intentionally not implemented.
- Physical iOS/Android installation, push notifications, and background delivery. Browser installation support is provided through the manifest/service worker; push notifications are not implemented.

## UX and integration notes

- Browsers without install prompt support receive platform-specific home-screen instructions.
- API responses are never cached by the service worker. Precached static assets keep the shell usable offline. Optional remote Google Fonts fall back to system fonts offline.
- All bookings, charges, and call statuses are explicitly marked as preview/simulated.
- Known browser automation quirk: pointer actions on the in-app browser sometimes did not activate controls; keyboard activation and resulting DOM state were used for functional verification.

## Conversation-first update / dual providers — 2026-10-01

- Production build passed; 18 unit/contract tests passed, covering extraction, follow-up preservation, no booking questions for informational calls, ambiguous time, Maps URL allowlist, directory-content persistence, provider duration caps, both provider adapters and signature tampering.
- Browser verified on production URL: complete message → three example branch cards → ready summary. Sending “Actually make it 8pm” preserves branch, guests and booking name.
- Mobile 390×844 verified: partial request → choose branch → time chips → name → ready summary with the chosen branch address. No mandatory details modal.
- Screenshots: `screenshots/conversation-branches-desktop.png`, `screenshots/conversation-branches-mobile.png`.
- Health endpoint reports Twilio default, both providers unconfigured, calling/payments false. Unconfigured places/calls/transcribe routes return 503 and do not contact external providers.
- Voice capture and paid transcription have NOT been tested on a physical microphone or against OpenRouter. Google Places/Brave, Supabase sign-in and actual telephony require credentials; adapter tests use mocks. No real calls or purchases were made.

## Service connections and WhatsApp-style voice composer — October 1

- Google Places test query returned HTTP 200. Twilio returned HTTP 200 with one existing voice-capable sender; saved it without purchasing a number or placing any calls. OpenAI model inference returned HTTP 200.
- Secrets stored in gitignored `.env` with owner-only permissions. Browser production bundle checked against actual server secret values: none present.
- Supabase public project key retrieved from the authenticated dashboard. Direct Postgres connection verified; installed `preview_states` and four owner-only policies; RLS verified enabled. Anonymous private-table and protected AI requests both return 401.
- Supabase site URL set to `http://127.0.0.1:3001`; allowed callback URLs include that origin and `http://127.0.0.1:5173`. Email auth enabled, signups enabled, email confirmation retained. Google login disabled. Built-in email sender remains configured; custom SMTP is needed for production.
- Supabase MCP registered; CLI OAuth reports successful login. This running task's MCP client fails token refresh response parsing. Database and dashboard were used for configuration; no claim of a successful MCP tool call.
- Composer microphone placement verified at 390×844. Clicking it while signed out opens the email signup/sign-in dialog. Recording controls and local voice-message playback implemented. Physical microphone, transcription of a real recording, email delivery, completed user login and cloud session persistence have not yet been verified end to end.
- Build passes; 20 tests pass. Calls, paid reloads and public deployment remain disabled/pending.
