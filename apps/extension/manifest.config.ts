import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

// Permissions per docs/ingestion-extension.md. Retailer host_permissions get
// added once the demo retailers are chosen (build-plan.md question 5).
export default defineManifest({
  manifest_version: 3,
  name: 'FitMirror',
  description: 'See which size fits you, and how it looks on you.',
  version: pkg.version,
  permissions: ['activeTab', 'storage', 'sidePanel', 'scripting'],
  action: { default_title: 'Open FitMirror' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  content_scripts: [
    {
      // Generic script: it only activates on pages with JSON-LD Product (M2).
      matches: ['https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});
