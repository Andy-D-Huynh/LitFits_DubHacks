// OpenCV.js exposes a large runtime; we only require Mat + onRuntimeInitialized.
type OpenCvRuntime = {
  Mat?: unknown;
  onRuntimeInitialized?: () => void;
  default?: unknown;
  then?: unknown;
  [key: string]: unknown;
};

declare global {
  interface Window {
    cv?: OpenCvRuntime & { onRuntimeInitialized?: () => void };
  }
}

const OPENCV_CDN = 'https://docs.opencv.org/4.10.0/opencv.js';
const PACKAGE_READY_MS = 8000;

let loading: Promise<OpenCvRuntime> | null = null;

export function loadOpenCv(): Promise<OpenCvRuntime> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV only runs in the browser'));
  }
  if (window.cv?.Mat) {
    return Promise.resolve(window.cv as OpenCvRuntime);
  }
  if (loading) return loading;

  loading = loadOpenCvInner().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

async function loadOpenCvInner(): Promise<OpenCvRuntime> {
  const fromPackage = await loadFromPackage();
  if (fromPackage?.Mat) {
    (window as unknown as { cv: OpenCvRuntime }).cv = fromPackage;
    return fromPackage;
  }
  return loadFromCdn();
}

async function loadFromPackage(): Promise<OpenCvRuntime | null> {
  try {
    // webpackIgnore: opencv.js references Node's `fs`, which breaks the Next bundle.
    // The browser still attempts the package import; a rejection falls through to the CDN.
    const imported: unknown = await import(
      /* webpackIgnore: true */
      '@techstark/opencv-js',
    );
    const cv = await resolveRuntime(imported);
    if (cv?.Mat) return cv;
    return null;
  } catch {
    return null;
  }
}

async function resolveRuntime(mod: unknown): Promise<OpenCvRuntime | null> {
  let current = mod;
  for (let hop = 0; hop < 4; hop += 1) {
    if (isPromise(current)) current = await current;
    if (!current || (typeof current !== 'object' && typeof current !== 'function')) return null;
    const record = current as OpenCvRuntime;
    if (record.Mat) return record;
    if (record.default && record.default !== current) {
      current = record.default;
      continue;
    }
    if (!('onRuntimeInitialized' in record) && !('cvtColor' in record)) return null;
    const ready = await waitForRuntime(record);
    return ready?.Mat ? ready : null;
  }
  return null;
}

function waitForRuntime(cv: OpenCvRuntime): Promise<OpenCvRuntime | null> {
  if (cv.Mat) return Promise.resolve(cv);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cv.Mat ? cv : null), PACKAGE_READY_MS);
    const previous = cv.onRuntimeInitialized;
    cv.onRuntimeInitialized = () => {
      clearTimeout(timer);
      if (typeof previous === 'function') previous();
      resolve(cv.Mat ? cv : null);
    };
  });
}

function loadFromCdn(): Promise<OpenCvRuntime> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv]');
    if (existing && window.cv) {
      const cv = window.cv;
      if (cv.Mat) {
        resolve(cv as OpenCvRuntime);
        return;
      }
      cv.onRuntimeInitialized = () => resolve(cv as OpenCvRuntime);
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_CDN;
    script.async = true;
    script.dataset.opencv = 'true';
    script.onerror = () => {
      reject(new Error('Failed to load OpenCV.js'));
    };
    script.onload = () => {
      const cv = window.cv;
      if (!cv) {
        reject(new Error('OpenCV loaded without global cv'));
        return;
      }
      if (cv.Mat) {
        resolve(cv as OpenCvRuntime);
        return;
      }
      cv.onRuntimeInitialized = () => resolve(cv as OpenCvRuntime);
    };
    document.head.appendChild(script);
  });
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}
