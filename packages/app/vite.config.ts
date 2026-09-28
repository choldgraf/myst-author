import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset URLs, so the build works under any path prefix
  esbuild: { jsx: 'automatic' },
  server: { allowedHosts: ['.app.github.dev'] }, // Codespaces forwards ports on this domain
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), preview: resolve(import.meta.dirname, 'preview.html') },
    },
  },
});
