import { applyTryOnResult, loadFigure } from '../lib/storage';

const API_BASE = 'http://localhost:3000';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'fitmirror:garment-added') {
    void chrome.runtime.sendMessage({ type: 'fitmirror:storage-updated' }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'fitmirror:try-on') {
    void (async () => {
      try {
        const figure = await loadFigure();
        const modelImage = figure.avatarImageUrl || figure.modelImage;
        if (!modelImage) {
          sendResponse({ ok: false, error: 'Add your photo in the FitMirror panel first.' });
          return;
        }
        if (typeof message.garmentImage !== 'string' || typeof message.productUrl !== 'string') {
          sendResponse({ ok: false, error: 'This page has no product image FitMirror can use.' });
          return;
        }
        const name = typeof message.name === 'string' ? message.name : 'Product';
        const retailer = typeof message.retailer === 'string' ? message.retailer : null;
        const res = await fetch(`${API_BASE}/api/tryon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelImage,
            garmentImage: message.garmentImage,
            productUrl: message.productUrl,
            name,
            retailer,
            category: typeof message.category === 'string' ? message.category : 'auto',
          }),
        });
        const data = (await res.json()) as { imageUrl?: string; error?: string };
        if (!res.ok || !data.imageUrl) {
          sendResponse({ ok: false, error: data.error || 'Try-on failed' });
          return;
        }
        await applyTryOnResult(data.imageUrl, {
          id: crypto.randomUUID(),
          productUrl: message.productUrl,
          name,
          garmentImageUrl: message.garmentImage.startsWith('data:')
            ? message.productUrl
            : message.garmentImage,
          retailer,
          addedAt: new Date().toISOString(),
        });
        sendResponse({ ok: true, imageUrl: data.imageUrl });
      } catch {
        sendResponse({
          ok: false,
          error: 'Could not reach the FitMirror server at http://localhost:3000. Start it with pnpm dev:web.',
        });
      }
    })();
    return true;
  }

  if (message?.type === 'fitmirror:fetch-image' && typeof message.url === 'string') {
    void (async () => {
      try {
        const res = await fetch(message.url as string, { redirect: 'follow' });
        if (!res.ok) {
          sendResponse({ ok: false });
          return;
        }
        const blob = await res.blob();
        if (!blob.type.startsWith('image/') || blob.size > 2_500_000) {
          sendResponse({ ok: false });
          return;
        }
        const dataUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        sendResponse({ ok: Boolean(dataUrl), dataUrl });
      } catch {
        sendResponse({ ok: false });
      }
    })();
    return true; // async sendResponse
  }

  return false;
});
