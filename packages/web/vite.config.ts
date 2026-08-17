import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The app calls the gateway on RELATIVE paths so one bundle is promotable
// across environments (see src/client.ts). In the image, nginx supplies the
// same-origin proxy; locally nothing did, so `pnpm dev` produced an app that
// could not reach a backend at all. This is that missing half.
const target = process.env['ALTIUS_API_URL'] ?? 'http://localhost:4099';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ws: the subscription transport shares the /graphql path.
      '/graphql': { target, changeOrigin: true, ws: true },
      '/api': { target, changeOrigin: true },
      '/fhir': { target, changeOrigin: true },
      '/mcp': { target, changeOrigin: true },
      '/health': { target, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
  },
});
