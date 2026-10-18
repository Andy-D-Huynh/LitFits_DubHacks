'use client';

import type { FitBody, Garment } from '@fitmirror/shared';
import { useState } from 'react';
import { FitPanel } from './fit-panel';
import { TryOnView } from './tryon-view';

// Holds the selected garment so the try-on and the fit panel stay in step.
export function StudioView({
  garments,
  body,
  profileId,
  photoUrl,
  demo,
  editHref,
}: {
  garments: Garment[];
  body: FitBody;
  profileId: string;
  photoUrl: string | null;
  demo: boolean;
  editHref: string;
}) {
  const [garmentId, setGarmentId] = useState<string | null>(garments[0]?.id ?? null);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <TryOnView profileId={profileId} garmentId={garmentId} photoUrl={photoUrl} demo={demo} />
      <FitPanel
        garments={garments}
        body={body}
        editHref={editHref}
        onGarmentChange={setGarmentId}
      />
    </div>
  );
}
