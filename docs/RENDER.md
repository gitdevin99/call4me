# Render deployment

Connect `gitdevin99/call4me` as a Node Web Service.

- Branch: `main`
- Root directory: leave empty
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Instance: a paid always-on instance
- Environment: `NODE_ENV=production`, `HOST=0.0.0.0`
- Let Render supply `PORT`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before building. These are public browser configuration; never put service-role credentials in a VITE variable.

Copy the necessary server secrets from the local ignored `.env` into Render environment settings: `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and `TELEPHONY_PROVIDER=twilio`. Keep all credentials out of Git. Whop integration is not implemented yet; storing its key does not enable payments.

After deploying, add `canyoucall.app` as a Render custom domain and use the DNS records Render supplies in Cloudflare. Update Supabase Site URL and redirect allowlist to the final HTTPS origin. Rebuild after changing VITE variables.

## Current release boundary

This publishes the PWA and authenticated assistant, lookup, and transcription endpoints. Phone calls and wallet reloads are still previews. The call endpoint fails closed, and `/api/health` reports `calling: false` and `payments: false`. Real voice streaming, durable billing and Whop payment webhooks must be implemented and verified before accepting customer payments.
