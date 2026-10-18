import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'FitMirror',
  description: 'Persistent fitting figure. Reads the clothing product page you have open.',
  version: pkg.version,
  permissions: ['activeTab', 'storage', 'sidePanel', 'scripting', 'tabs'],
  host_permissions: ['https://*/*', 'http://*/*'],
  // MediaPipe (head detection for the try-on blur) compiles its bundled wasm.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  action: { default_title: 'Open FitMirror' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  content_scripts: [
    {
      matches: ['https://*/*', 'http://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});
