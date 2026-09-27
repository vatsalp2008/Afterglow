import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // MediaPipe's loader code-splits with import(), which classic (iife) workers can't do.
  worker: { format: 'es' },
});
