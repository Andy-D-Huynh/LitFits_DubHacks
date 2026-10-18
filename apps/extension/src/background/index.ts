import type { FitDirectGarment, FitResult } from '@fitmirror/shared';
import { apiBase, loadSettings, type Settings } from '../lib/settings';
import { applyTryOnResult, loadFigure } from '../lib/storage';
import { showToastInPage } from '../lib/toast';
import {
  fitEntry,
  fitSkipReason,
  personForTryOn,
  readJson,
  resolveImageUrl,
  tryOnErrorMessage,
} from '../lib/tryon-flow';
import { loadTryOnState, recordFit, updateTryOnState } from '../lib/tryon-state';

const TRYON_TIMEOUT_MS = 150_000;
const FIT_TIMEOUT_MS = 15_000;
const RENDER_CHECK_TIMEOUT_MS = 20_000;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'fitmirror:garment-added') {
    void chrome.runtime.sendMessage({ type: 'fitmirror:storage-updated' }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'fitmirror:try-on') {
    void tryOn(message as Record<string, unknown>, sender.tab?.id)
      .catch(() => ({ ok: false, error: 'Try-on failed' }))
      .then(sendResponse);
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
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
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

type TryOnReply = { ok: boolean; imageUrl?: string; error?: string };
type Product = { productUrl: string; productName: string };

/**
 * One "Try this on": the render (POST /api/tryon/direct) and, alongside it,
 * the size (POST /api/fit/direct). Results land in chrome.storage (figure and
 * `fitmirror-tryon`) for the panel and the page dock. A failed render leaves
 * the last good look in place and shows a toast on the page.
 */
async function tryOn(
  message: Record<string, unknown>,
  tabId: number | undefined,
): Promise<TryOnReply> {
  if (typeof message.garmentImage !== 'string' || typeof message.productUrl !== 'string') {
    return fail('This page has no product image FitMirror can use.', null, tabId);
  }
  const base = await apiBase();
  const [figure, settings, state] = await Promise.all([
    loadFigure(),
    loadSettings(),
    loadTryOnState(),
  ]);
  const name = typeof message.name === 'string' ? message.name : 'Product';
  const retailer = typeof message.retailer === 'string' ? message.retailer : null;
  const product: Product = { productUrl: message.productUrl, productName: name };

  // Not awaited: the size shows up as soon as it's ready, render or not.
  const garment =
    message.fitGarment && typeof message.fitGarment === 'object'
      ? (message.fitGarment as FitDirectGarment)
      : null;
  void checkFit(base, settings, product, garment);

  const person = personForTryOn(figure, settings, state.photo);
  if (!person.ok) return fail(person.error, product.productUrl, tabId);

  await updateTryOnState({
    pending: { productUrl: product.productUrl, since: new Date().toISOString() },
  });
  try {
    const res = await fetch(`${base}/api/tryon/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelImage: person.modelImage,
        blurHead: person.blurHead,
        headBox: person.headBox,
        garmentImage: message.garmentImage,
        productUrl: product.productUrl,
        name,
        retailer,
        category: typeof message.category === 'string' ? message.category : 'auto',
      }),
      signal: AbortSignal.timeout(TRYON_TIMEOUT_MS),
    });
    const data = await readJson(res);
    const imageUrl =
      typeof data?.imageUrl === 'string' ? resolveImageUrl(data.imageUrl, base) : null;
    if (!res.ok || !imageUrl) {
      return fail(
        tryOnErrorMessage(res.status, data),
        product.productUrl,
        tabId,
        figure.avatarImageUrl,
      );
    }
    if (!(await imageLoads(imageUrl))) {
      return fail('The new look did not load.', product.productUrl, tabId, figure.avatarImageUrl);
    }
    await applyTryOnResult(imageUrl, {
      id: crypto.randomUUID(),
      productUrl: product.productUrl,
      name,
      garmentImageUrl: message.garmentImage.startsWith('data:')
        ? product.productUrl
        : message.garmentImage,
      retailer,
      addedAt: new Date().toISOString(),
    });
    await updateTryOnState({ lastGoodRender: imageUrl, lastError: null });
    return { ok: true, imageUrl };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return fail(
      timedOut ? 'Try-on took too long.' : `Could not reach the FitMirror server at ${base}.`,
      product.productUrl,
      tabId,
      figure.avatarImageUrl,
    );
  } finally {
    await updateTryOnState({ pending: null });
  }
}

async function fail(
  message: string,
  productUrl: string | null,
  tabId: number | undefined,
  lastLook?: string | null,
): Promise<TryOnReply> {
  const shown = lastLook ? `${message} Showing your last look.` : message;
  await updateTryOnState({
    lastError: { message: shown, productUrl, at: new Date().toISOString() },
  });
  if (tabId !== undefined) {
    // Pages like chrome:// can't take scripts; the panel still has lastError.
    await chrome.scripting
      .executeScript({ target: { tabId }, func: showToastInPage, args: [shown, 'error'] })
      .catch(() => {});
  }
  return { ok: false, error: shown };
}

async function imageLoads(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(RENDER_CHECK_TIMEOUT_MS) });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

async function checkFit(
  base: string,
  settings: Settings,
  product: Product,
  garment: FitDirectGarment | null,
): Promise<void> {
  const skip = fitSkipReason(garment, settings.measurements);
  if (skip) {
    await recordFit(fitEntry(product, { status: skip }));
    return;
  }
  try {
    const res = await fetch(`${base}/api/fit/direct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        measurements: settings.measurements,
        fitPreference: settings.fitPreference,
        garment,
      }),
      signal: AbortSignal.timeout(FIT_TIMEOUT_MS),
    });
    const data = await readJson(res);
    if (!res.ok || !data || !Array.isArray(data.perSize)) throw new Error('fit failed');
    await recordFit(fitEntry(product, { result: data as unknown as FitResult }));
  } catch {
    await recordFit(fitEntry(product, { status: 'error' }));
  }
}
