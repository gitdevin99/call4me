# Render deployment

Connect `gitdevin99/call4me`, branch `main`, as a paid Node Web Service.

- Root directory: empty
- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health: `/api/health`
- `HOST=0.0.0.0`, `NODE_ENV=production`; Render supplies `PORT`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before building. Use Render environment variables for `DATABASE_URL`, `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `WHOP_API_KEY`, `WHOP_COMPANY_ID`, `WHOP_WEBHOOK_SECRET`, and `PUBLIC_ORIGIN=https://canyoucall.app`. Set `OPENAI_REALTIME_MODEL=gpt-realtime` and `TELEPHONY_PROVIDER=twilio`.

Set `TWILIO_VOICE_URL=https://canyoucall.app/api/voice/start` and `TWILIO_STATUS_CALLBACK_URL=https://canyoucall.app/api/voice/status`. The runtime selects from owned numbers dynamically; it does not rely on a fixed `TWILIO_FROM_NUMBER`.

Apply both Supabase schemas and grant the restricted runtime database role access to private `callapp` tables with corresponding RLS policies. The bundled public Supabase CA verifies TLS. Never grant browser roles access to financial tables.

Add the root and www custom domains in Render; configure DNS using Render's supplied values. Set the Supabase Auth Site URL and redirects to the production origin and configure SMTP. Rebuild when changing VITE variables.

Activate using `CALLS_ENABLED=true` and `PAYMENTS_ENABLED=true`. Validate signed Whop delivery, authenticated wallet reads, destination quotes, a real paid reload, and a user-authorized test call. Activation flags alone do not prove these tests passed. Existing installed PWAs should accept the Update app prompt after a release.
