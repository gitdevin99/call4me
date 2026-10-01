import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Call for me', short_name: 'Call for me', description: 'A little less calling. A little more living.',
      theme_color: '#ffffff', background_color: '#f8f9fb', display: 'standalone', start_url: '/', scope: '/',
      icons: [{src:'/icon-192.png',sizes:'192x192',type:'image/png'}, {src:'/icon-512.png',sizes:'512x512',type:'image/png'}, {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]
    },
    workbox: {globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallbackDenylist: [/^\/api\//], cleanupOutdatedCaches: true}
  })],
  server: {port: 5173, proxy: {'/api': 'http://127.0.0.1:3001'}}
});
