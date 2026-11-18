// Offline preview build: relative asset paths, the offline fetch shim, and a stub for the
// server-only model client so api/_trends can run its analysis in the browser.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: { outDir: 'dist-offline', emptyOutDir: true, chunkSizeWarningLimit: 6000 },
  resolve: {
    alias: [{ find: /^\.\/_nebius\.js$/, replacement: fileURLToPath(new URL('./offline/nebius-stub.ts', import.meta.url)) }],
  },
  plugins: [{
    name: 'atlas-offline',
    transformIndexHtml: { order: 'pre', handler: (html: string) => html.replace('<script type="module" src="/src/main.ts"></script>', '<script type="module" src="/offline/offline.ts"></script>\n    <script type="module" src="/src/main.ts"></script>') },
    transform(code, id) {
      if (!/src\/(globe|library|landmarks)\.ts$/.test(id)) return null;
      // Same-origin asset paths become relative so they resolve inside the preview page.
      return code.replace(/(['"`])\/(earth|models|splats)\//g, '$1./$2/');
    },
  }],
});
