import posthog from 'posthog-js';

// Browser project tokens are public. Defaults keep Render deployments configured;
// VITE_ overrides allow a different analytics project in another environment.
const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? 'phc_yvYMcXwikkEKacvSZtXC4sWsQzWVoK5Ve8MxvE8pdje9';
const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
let initialized = false;
let identifiedUser: string | null = null;

export function initAnalytics() {
  if (initialized || !import.meta.env.PROD || !token) return;
  posthog.init(token, {
    api_host: host,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: false,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      blockSelector: '.message-row, .transcript, .profile-card, .call-card, .result-card, audio, video, input[type="hidden"], input[type="file"]',
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: () => null,
    },
    before_send: (event) => {
      if (!event) return event;
      // OAuth codes and payment redirect parameters must never enter analytics.
      for (const key of ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer']) {
        const value = event.properties[key];
        if (typeof value === 'string') {
          try { const url = new URL(value); event.properties[key] = url.origin + url.pathname; }
          catch { delete event.properties[key]; }
        }
      }
      return event;
    },
  });
  initialized = true;
  posthog.startSessionRecording(true);
  posthog.capture('$pageview', { app_mode: window.matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'browser' });
}

export function identifyAnalytics(userId: string | null) {
  if (!initialized || userId === identifiedUser) return;
  if (userId) posthog.identify(userId);
  else posthog.reset();
  identifiedUser = userId;
}

// Deliberately restrict analytics to non-content properties.
export function trackEvent(event: 'sign_in_completed' | 'request_submitted' | 'checkout_opened' | 'call_started', properties: Record<string, string | number | boolean> = {}) {
  if (initialized) posthog.capture(event, properties);
}
