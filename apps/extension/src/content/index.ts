import type { IngestRequest } from '@fitmirror/shared';

// M2: detect JSON-LD Product, show the floating "Add to figure" button, run
// extraction, and POST an IngestRequest to /api/garments/ingest.
export type ContentPayload = IngestRequest;
