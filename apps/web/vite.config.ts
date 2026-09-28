import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Recorded sessions live outside the app root, where Vite doesn't watch for new
// files; watching them lets `?fixture=` pick up a new recording without a restart.
function watchFixtures(): Plugin {
  return {
    name: 'afterglow:watch-fixtures',
    configureServer(server) {
      server.watcher.add(fileURLToPath(new URL('../../fixtures/sessions', import.meta.url)));
    },
  };
}

export default defineConfig({
  plugins: [react(), watchFixtures()],
  // MediaPipe's loader code-splits with import(), which classic (iife) workers can't do.
  worker: { format: 'es' },
});
