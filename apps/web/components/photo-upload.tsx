'use client';

import { headBoxFromLandmarks, type NormBox } from '@fitmirror/shared';
import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';

// One full-body photo. The head is located in the browser with MediaPipe Pose
// so the server can blur it for try-on; if that fails the server blurs the top
// of the photo instead. The photo itself is processed and stored server-side.

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

async function detectHeadBox(file: File): Promise<NormBox | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL },
      runningMode: 'IMAGE',
      numPoses: 1,
    });
    try {
      const pose = landmarker.detect(img).landmarks[0];
      return pose ? headBoxFromLandmarks(pose) : null;
    } finally {
      landmarker.close();
    }
  } catch {
    return null; // offline or no person found: the server falls back to a top band
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; step: string }
  | { kind: 'done'; note: string }
  | { kind: 'error'; message: string };

export function PhotoUpload({
  photoUrl,
  hasProfile,
}: {
  photoUrl: string | null;
  hasProfile: boolean;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState(photoUrl);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus({ kind: 'working', step: 'Finding your head to blur it…' });
    const headBox = await detectHeadBox(file);
    setStatus({ kind: 'working', step: 'Uploading…' });
    const form = new FormData();
    form.append('photo', file);
    if (headBox) form.append('headBox', JSON.stringify(headBox));
    const res = await fetch('/api/profile/photo', { method: 'POST', body: form });
    const body = (await res.json().catch(() => null)) as {
      photoUrl?: string;
      headBoxSource?: string;
      error?: string;
    } | null;
    if (!res.ok || !body?.photoUrl) {
      setStatus({ kind: 'error', message: body?.error ?? `Upload failed (${res.status})` });
      return;
    }
    setPreview(body.photoUrl);
    setStatus({
      kind: 'done',
      note:
        body.headBoxSource === 'pose'
          ? 'Saved. Your face is blurred before any try-on image is generated.'
          : "Saved. We couldn't find your head automatically, so the top of the photo is blurred for try-on instead.",
    });
    router.refresh();
  }

  if (!hasProfile) {
    return (
      <p className="text-muted-foreground text-sm">
        Save your measurements first, then add a photo.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        One full-body photo, standing, plain background. Location data is removed, and the try-on
        provider only ever receives a copy with your face blurred.
      </p>
      {preview && (
        <img
          src={preview}
          alt="Your model photo"
          className="h-64 rounded-md border object-contain"
        />
      )}
      <label className="bg-secondary inline-block cursor-pointer rounded-md px-4 py-2 text-sm">
        {preview ? 'Replace photo' : 'Choose photo'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={status.kind === 'working'}
          onChange={onFile}
        />
      </label>
      {status.kind === 'working' && <p className="text-sm">{status.step}</p>}
      {status.kind === 'done' && <p className="text-sm">{status.note}</p>}
      {status.kind === 'error' && <p className="text-destructive text-sm">{status.message}</p>}
    </div>
  );
}
