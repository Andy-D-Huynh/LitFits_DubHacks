import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'FitMirror',
  description: 'Persistent fitting figure. Reads the clothing product page you have open.',
  version: pkg.version,
  // debugger: real clicks for add-to-bag. <all_urls>: screenshot for the Gemini fallback.
  permissions: ['activeTab', 'storage', 'sidePanel', 'scripting', 'tabs', 'debugger'],
  host_permissions: ['<all_urls>'],
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
