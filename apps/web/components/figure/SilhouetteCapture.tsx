'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fileToImageDataUrl } from '@/lib/images/normalize-upload';
import { extractSilhouette } from '@/lib/opencv/extract-silhouette';
import { useFigureStore } from '@/lib/store/figure-store';

type Props = {
  onCaptured?: () => void;
};

export function SilhouetteCapture({ onCaptured }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowNotes, setLowNotes] = useState<string[]>([]);
  const setSilhouette = useFigureStore((s) => s.setSilhouette);

  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
    setStreaming(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStreaming(true);
    } catch {
      setError('Camera access denied. Upload a full-body photo instead.');
    }
  }

  async function processSource(dataUrl: string) {
    setBusy(true);
    setError(null);
    setLowNotes([]);
    try {
      const result = await extractSilhouette(dataUrl);
      setSilhouette(result);
      if (result.quality?.status === 'low') {
        setLowNotes(result.quality.messages);
      }
      stopCamera();
      onCaptured?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build outline figure');
    } finally {
      setBusy(false);
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !streaming) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    await processSource(canvas.toDataURL('image/jpeg', 0.92));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToImageDataUrl(file);
      await processSource(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl tracking-tight">Create your outline</h2>
        <p className="mt-1 max-w-md text-sm text-[var(--fm-muted)]">
          Use a full-body, front-facing photo with one person and a plain background. The outline is a
          flat trace of that photo. JPEG, PNG, WebP, and HEIC are supported.
        </p>
      </div>

      <div className="relative aspect-[3/4] max-w-sm overflow-hidden rounded-sm bg-[var(--fm-ink)]/5">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${streaming ? 'opacity-100' : 'absolute opacity-0'}`}
        />
        {!streaming ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[var(--fm-muted)]">
            <span>Camera preview</span>
            <span className="text-xs">or upload JPEG / PNG / HEIC</span>
          </div>
        ) : null}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--fm-paper)]/80 text-sm font-medium">
            Tracing outline…
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {lowNotes.length > 0 ? (
        <div className="max-w-md space-y-1 rounded-sm border border-[var(--fm-ink)]/15 bg-[var(--fm-ink)]/5 px-3 py-2 text-sm text-[var(--fm-ink)]">
          {lowNotes.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!streaming ? (
          <button type="button" className="fm-btn-primary" onClick={() => void startCamera()}>
            Open camera
          </button>
        ) : (
          <>
            <button
              type="button"
              className="fm-btn-primary"
              disabled={busy}
              onClick={() => void captureFrame()}
            >
              Capture outline
            </button>
            <button type="button" className="fm-btn-ghost" onClick={stopCamera}>
              Stop camera
            </button>
          </>
        )}
        <label className={`fm-btn-ghost cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          Upload photo
          <input
            type="file"
            accept="image/*,.heic,.heif,image/heic,image/heif"
            className="sr-only"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  );
}
