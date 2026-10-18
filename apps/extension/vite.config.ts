import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import manifest from './manifest.config.ts';

// MV3 pages can't load scripts from a CDN, so MediaPipe's wasm loader and
// binary ship inside the extension at /mediapipe (public/ is copied to dist/).
// Only the SIMD build: every Chrome that runs MV3 supports it.
function copyMediapipeWasm(): Plugin {
  return {
    name: 'fitmirror:copy-mediapipe-wasm',
    buildStart() {
      const require = createRequire(import.meta.url);
      const out = join(import.meta.dirname, 'public/mediapipe');
      mkdirSync(out, { recursive: true });
      for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
        copyFileSync(require.resolve(`@mediapipe/tasks-vision/${file}`), join(out, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [copyMediapipeWasm(), react(), crx({ manifest })],
  server: { port: 5173, strictPort: true },
});
