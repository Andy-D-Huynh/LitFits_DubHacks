import {
  applyTryOnResult,
  loadFigure,
  markAllInCart,
  markPendingCartAdd,
  removeGarment,
  toggleCart,
} from '../lib/storage';
import type { GarmentCategory } from '../lib/types';

const API_BASE = 'http://localhost:3000';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

/** Click at viewport CSS pixel (x, y) through the DevTools protocol, which pages see as a real mouse. */
async function trustedClick(tabId: number, x: number, y: number) {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  try {
    const mouse = (type: string, extra: Record<string, unknown> = {}) =>
      chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type, x, y, ...extra });
    await mouse('mouseMoved');
    await mouse('mousePressed', { button: 'left', buttons: 1, clickCount: 1 });
    await mouse('mouseReleased', { button: 'left', buttons: 0, clickCount: 1 });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'fitmirror:garment-added') {
    void chrome.runtime.sendMessage({ type: 'fitmirror:storage-updated' }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'fitmirror:remove-garment' && typeof message.id === 'string') {
    void (async () => {
      await removeGarment(message.id);
      void chrome.runtime.sendMessage({ type: 'fitmirror:storage-updated' }).catch(() => {});
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === 'fitmirror:toggle-cart' && typeof message.id === 'string') {
    void (async () => {
      await toggleCart(message.id, message.inCart);
      void chrome.runtime.sendMessage({ type: 'fitmirror:storage-updated' }).catch(() => {});
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === 'fitmirror:mark-all-cart') {
    void (async () => {
      await markAllInCart();
      void chrome.runtime.sendMessage({ type: 'fitmirror:storage-updated' }).catch(() => {});
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === 'fitmirror:open-tabs' && Array.isArray(message.urls)) {
    void (async () => {
      for (const rawUrl of message.urls) {
        if (typeof rawUrl === 'string' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
          if (message.autoAddToCart) {
            await markPendingCartAdd(rawUrl);
          }
          const url = message.autoAddToCart
            ? rawUrl.includes('#')
              ? `${rawUrl}&fitmirror_cart=1`
              : `${rawUrl}#fitmirror_cart=1`
            : rawUrl;
          chrome.tabs.create({ url, active: true }).catch(() => {});
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === 'fitmirror:try-on') {
    void (async () => {
      try {
        const figure = await loadFigure();
        const modelImage = figure.avatarImageUrl || figure.modelImage;
        if (!modelImage) {
          sendResponse({ ok: false, error: 'Add your photo in the FitMirror avatar first.' });
          return;
        }
        if (typeof message.garmentImage !== 'string' || typeof message.productUrl !== 'string') {
          sendResponse({ ok: false, error: 'This page has no product image FitMirror can use.' });
          return;
        }
        const name = typeof message.name === 'string' ? message.name : 'Product';
        const retailer = typeof message.retailer === 'string' ? message.retailer : null;

        console.log('[FitMirror Background] Starting try-on for:', name, 'Category:', message.category, 'Fit:', message.fit);

        const tryPorts = ['http://localhost:3000', 'http://localhost:3001'];
        let res: Response | null = null;
        let lastError: Error | null = null;

        for (const base of tryPorts) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 90_000);
            res = await fetch(`${base}/api/tryon`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                modelImage,
                garmentImage: message.garmentImage,
                productUrl: message.productUrl,
                name,
                retailer,
                category: typeof message.category === 'string' ? message.category : 'auto',
                fit: typeof message.fit === 'string' ? message.fit : 'regular',
                color: typeof message.color === 'string' ? message.color : null,
              }),
            });
            clearTimeout(timer);
            break;
          } catch (err: any) {
            lastError = err;
            console.warn(`[FitMirror Background] Attempt to ${base} failed:`, err?.message);
          }
        }

        if (!res) {
          sendResponse({
            ok: false,
            error: lastError?.message || 'Could not reach the FitMirror server at http://localhost:3000. Start it with pnpm dev:web.',
          });
          return;
        }

        console.log('[FitMirror Background] Server responded with status:', res.status);
        const data = (await res.json()) as { imageUrl?: string; error?: string };
        if (!res.ok || !data.imageUrl) {
          console.error('[FitMirror Background] Server error:', data.error);
          sendResponse({ ok: false, error: data.error || 'Try-on failed' });
          return;
        }

        console.log('[FitMirror Background] Received try-on image:', data.imageUrl);
        await applyTryOnResult(
          data.imageUrl,
          {
            id: crypto.randomUUID(),
            productUrl: message.productUrl,
            name,
            garmentImageUrl: message.garmentImage.startsWith('data:')
              ? message.productUrl
              : message.garmentImage,
            retailer,
            addedAt: new Date().toISOString(),
            inCart: false,
          },
          typeof message.category === 'string' ? (message.category as GarmentCategory) : undefined,
        );
        void chrome.runtime.sendMessage({ type: 'fitmirror:storage-updated' }).catch(() => {});
        sendResponse({ ok: true, imageUrl: data.imageUrl });
      } catch (err: any) {
        console.error('[FitMirror Background] Unexpected try-on error:', err);
        sendResponse({
          ok: false,
          error: err?.message || 'Try-on failed. Please check that pnpm dev:web is running.',
        });
      }
    })();
    return true;
  }

  // A real (isTrusted) click for stores that ignore script-dispatched events.
  if (message?.type === 'fitmirror:trusted-click' && typeof message.x === 'number' && typeof message.y === 'number') {
    const tabId = _sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return false;
    }
    void trustedClick(tabId, message.x, message.y)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.warn('[FitMirror Background] Trusted click failed:', err?.message);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === 'fitmirror:capture-tab') {
    const tab = _sender.tab;
    // captureVisibleTab only sees the window's active tab; anything else would be the wrong page.
    if (!tab?.active || tab.windowId == null) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.tabs
      .captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === 'fitmirror:locate-cart' && message.payload) {
    void (async () => {
      for (const base of ['http://localhost:3000', 'http://localhost:3001']) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20_000);
          const res = await fetch(`${base}/api/cart/locate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(message.payload),
          });
          clearTimeout(timer);
          const data = await res.json();
          sendResponse(res.ok ? { ok: true, ...data } : { ok: false, error: data?.error });
          return;
        } catch (err) {
          console.warn(`[FitMirror Background] Cart locate via ${base} failed:`, (err as Error)?.message);
        }
      }
      sendResponse({ ok: false, error: 'Could not reach the FitMirror server.' });
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
