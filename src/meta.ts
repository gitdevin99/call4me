type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push?: Pixel;
  loaded: boolean;
  version: string;
};
declare global {
  interface Window { fbq?: Pixel; _fbq?: Pixel }
}

// A pixel ID is public configuration, not an API credential.
const pixelId = import.meta.env.VITE_META_PIXEL_ID ?? '1833990954283022';
let initialized = false;

export function initMetaPixel() {
  if (initialized || !import.meta.env.PROD || !/^\d+$/.test(pixelId)) return;
  if (location.hostname !== 'canyoucall.app' && location.hostname !== 'www.canyoucall.app') return;
  if (navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  // Meta includes the page URL. Never initialize on an OAuth callback or a URL
  // containing unknown parameters, which could include credentials or chat data.
  const url = new URL(location.href);
  if (url.hash || [...url.searchParams.keys()].some(key => !['fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'checkout'].includes(key))) return;
  if (!window.fbq) {
    const pixel: Pixel = Object.assign((...args: unknown[]) => {
      if (pixel.callMethod) pixel.callMethod(...args);
      else pixel.queue.push(args);
    }, { queue: [] as unknown[][], loaded: true, version: '2.0' });
    pixel.push = pixel;
    window.fbq = window._fbq = pixel;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  window.fbq('set', 'autoConfig', false, pixelId);
  window.fbq('init', pixelId);
  window.fbq('trackSingle', pixelId, 'PageView');
  initialized = true;
}

export function trackMetaCheckout(cents: number) {
  if (!initialized || ![500, 1000, 2000].includes(cents)) return;
  window.fbq?.('trackSingle', pixelId, 'InitiateCheckout', {
    value: cents / 100, currency: 'USD', content_name: 'Prepaid calling credit', num_items: 1,
  });
}
