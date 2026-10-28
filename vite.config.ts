import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  // This Vite instance packages the host, never the submitted application.
  plugins: [cloudflare({
    persistState: { path: process.env.TEST_STATE_DIR ?? '.cloudflare/state' },
    inspectorPort: false
  })],
  publicDir: false,
  server: {
    // Let the host handle preview API preflights, including opaque sandbox origins.
    cors: false,
    host: '127.0.0.1',
    port: Number(process.env.TEST_PORT ?? 8787),
    strictPort: true
  }
});
