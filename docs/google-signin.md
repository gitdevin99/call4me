# Google sign-in for the installed PWA

The app uses Google's rendered sign-in button in popup mode. The callback exchanges the Google ID token with Supabase in the originating app, so its persisted session and pending request remain in the PWA's storage. A random nonce is hashed for Google and supplied unhashed to Supabase. Tokens are not put in application URLs or sent through a custom cross-window relay.

Enable only after configuring the Google OAuth Web client:

1. Google Cloud / Google Auth Platform: configure branding and audience for Can You Call, then create a Web application client.
2. Authorized JavaScript origin: `https://canyoucall.app`. Add localhost only when testing locally. The Maps API key is not an OAuth client.
3. For Supabase's redirect flow, the authorized redirect URI is `https://tgzjcpifdjcjbmdhwaca.supabase.co/auth/v1/callback`.
4. Supabase / Authentication / Sign In / Providers / Google: enable the provider and configure this client ID and secret. Keep nonce verification enabled. Never put the client secret in frontend environment variables.
5. Render: set `VITE_GOOGLE_CLIENT_ID` to the public Web client ID and rebuild. This switches the sign-in modal from email links to Google's button.
6. Test a guest request, Google account selection, sign-in, automatic request resumption, closing/reopening the PWA, cancellation, and retry on a physical iPhone and Android device.

The implementation is prepared, but Google login is not active until steps 1–5 are completed. Browser and installed-PWA storage are not interchangeable on iOS. An ordinary email link cannot reliably launch an installed iOS PWA. Popup authentication must be tested on the target devices; do not claim native deep-link behavior. An email OTP entered in the PWA is a possible fallback if a device blocks the popup (requires email delivery/template setup).
