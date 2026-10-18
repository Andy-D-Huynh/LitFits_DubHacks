/** Convert HEIC/HEIF (and other odd uploads) into a browser-friendly data URL. */

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  return name.endsWith('.heic') || name.endsWith('.heif');
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image'));
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

async function convertHeic(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!(blob instanceof Blob)) throw new Error('HEIC conversion failed');
  return blob;
}

/** Returns a data URL the canvas / OpenCV pipeline can load. */
export async function fileToImageDataUrl(file: File): Promise<string> {
  if (isHeicFile(file)) {
    try {
      const jpeg = await convertHeic(file);
      return blobToDataUrl(jpeg);
    } catch {
      throw new Error(
        'This HEIC photo could not be converted. Try exporting it as JPEG/PNG in Photos, or use the camera capture.',
      );
    }
  }

  // Ensure the browser can decode it before returning
  const dataUrl = await blobToDataUrl(file);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () =>
      reject(
        new Error(
          'That file is not a readable image. Use JPEG, PNG, WebP, or HEIC (converted automatically).',
        ),
      );
    img.src = dataUrl;
  });
  return dataUrl;
}
