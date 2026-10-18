import { headBoxFromLandmarks, type NormBox } from '@fitmirror/shared';

// Finds the head in the user's photo with MediaPipe Pose, as /onboarding does,
// so the server can blur it before try-on. Runs in extension pages (the side
// panel), which can't load scripts from a CDN: the wasm files ship in the
// extension under /mediapipe (copied at build time, see vite.config.ts). The
// model is data, not code, so it is fetched from Google's model bucket.

const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const TIMEOUT_MS = 15_000;

/** Null when MediaPipe can't run or finds no confident face; the server then blurs the top band. */
export async function detectHeadBox(dataUrl: string): Promise<NormBox | null> {
  if (typeof document === 'undefined') return null; // service worker: no canvas
  const work = (async () => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('mediapipe'));
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
  })();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return null;
  }
}
