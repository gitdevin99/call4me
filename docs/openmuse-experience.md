# OpenMuse-inspired calling experience

Pip is the default `/` experience. The previous layout remains available with `?experience=classic`. Local preview: `http://127.0.0.1:5181/` (after `npm run build` and `npm run preview -- --port 5181`). This is an adaptation of OpenMuse's interaction ideas, not an installation of its agent backend.

## Design

- Visual thesis: a calm, personal calling companion with soft surfaces, restrained blue, and readable mobile typography.
- Content plan: assistant identity and request entry; four call-purpose shortcuts; actual recent requests; approval assurance; a persistent typed/voice composer.
- Interaction thesis: a short home entrance, subtle shortcut affordances, and an expandable plan driven by actual call state. Reduced motion is respected.

## Integrated behavior

`MuseHome` feeds the existing `startChoice`, `selectChat`, and message flow. All request persistence, Supabase auth, Google Maps discovery, voice notes, approval, metering, payment, and memory behavior continues through the existing application. No new vendor credentials, permissions, or customer data transfers are introduced by this experience.

`CallJourney` reads the current thread. It distinguishes drafts, ready requests, ringing/connected calls, reviewed results, missing information, and cancellation. A provider call reaching `completed` alone never becomes “Request completed.” No simulated progress timers or fictional recent tasks are added.

## Why not replace the backend wholesale?

Source inspected: https://github.com/CopilotKit/openmuse

OpenMuse is an MIT-licensed alpha template built with Expo/React Native, a Hono/CopilotKit server, and a persistent browser worker. Its current architecture uses a shared single-owner access key and CopilotKit Intelligence for rich threads. Our app is a customer-facing React/Vite/Express service with Supabase user isolation and a metered calling backend. Adopting the full stack would require an explicit architecture migration, separate service credentials, and per-user isolation rather than dropping its shared access key into this app.

The preview borrows the calm workspace and visible plan concepts; the React components are authored locally. No upstream mascot or source files are redistributed. Browser/email/computer execution, task leases, push notifications, and CopilotKit thread storage are not part of this implementation.

## Checks

- Production TypeScript/Vite build.
- Existing test suite plus call-journey outcome/state tests.
- Rendered mobile/desktop preview, purpose selection, expandable plan, existing auth modal and preserved request, recent-request reopen, and default-view check.
- No outbound call or paid transaction is placed as part of UI verification.

## Pip character

Pip is an original bluebird with an oversized head, large expressive eyes, soft rounded shapes, and a navy calling headset. OpenMuse includes its own capybara mascot; we do not redistribute that asset.

Three transparent PNGs live in `public/characters/`: `pip-welcome.png`, `pip-attentive.png`, and `pip-happy.png`. They were generated with the built-in image-generation tool. Welcome waves, attentive listens through the headset, and happy raises both wings. Thinking and calling reuse attentive with restrained CSS motion; a completed call only celebrates when its reviewed outcome is confirmed. Reduced-motion preferences disable animation.

Generation prompt set: create an original adult-friendly bluebird with a very large head, enormous glossy eyes, soft rounded body, blue feathers, ivory chest, coral beak and feet, navy headset and microphone, confident friendly smile, waving wing, full body, transparent background, no lettering. Edit the welcome reference while preserving its exact proportions, palette, feathers, and headset to create (1) attentive listening with a wing at the earpiece and (2) a happy confirmed-outcome pose with both wings raised.

`server/conversation.mjs` gives the existing chat assistant Pip's warm, capable, gently witty personality. It prohibits fabricated capabilities, repeated introductions, and humor about failures, payments, or sensitive details. Existing factual, context, approval, and spending rules remain in that prompt. Telephone voice instructions are unchanged.

### Sprite animation replacement

The production character now uses `pip-sprite-v2.webp`, a transparent 4-by-4 atlas with 16 separately drawn eyelid, wing, head, and beak poses. It was generated with the built-in image tool from the original welcome reference, then encoded as a 1024px WebP (277 KiB). The prompt specified four rows: idle blink; wing wave; attentive listening; speaking and celebration, maintaining the exact character and cell alignment, with no text or grid lines.

`src/pip-animation.ts` is the single timing source for native CSS stepped frame playback. React switches the mood rather than repainting a timer every frame. Idle blinking and waving run automatically; a nonempty composer switches home/header to listening, a pending model reply uses thinking, and an active call uses the speaking sequence. Speaking is a call-state indicator, not audio-synchronized lip movement. Reduced motion shows a stationary appropriate pose. The WebP is precached for installed PWA use. Old whole-image bobbing is no longer applied.

Verified production build and 49 passing tests; rendered 320px and 390px layouts, all character images loaded, greeting interaction, customer-support entry, and expanded call plan. Screenshots: `output/pip-home-mobile.png` and `output/pip-chat-mobile.png`. Deployment uses the existing Render auto-deploy pipeline from GitHub main; verify the public home after publishing.
