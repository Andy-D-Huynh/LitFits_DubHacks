/** Shrink a user photo to a JPEG the extension can store and send to try-on. */
export function fileToModelImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read that photo'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxEdge = 1280;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not prepare that photo'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () =>
        reject(new Error('Could not open that file. Use a JPEG or PNG photo.'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
