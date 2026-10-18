import { captureProductImage, extractProductFromPage } from '../lib/extract-product';
import { loadFigure, setAvatarMinimized } from '../lib/storage';
import type { FigurePersist, GarmentCategory } from '../lib/types';
import { maybeSyncStudio } from './studio-sync';

maybeSyncStudio();

const ROOT_ID = 'fitmirror-avatar-root';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'fitmirror:read-page') {
    sendResponse({ ok: true, product: extractProductFromPage() });
    return false;
  }
  if (message?.type === 'fitmirror:wear-page') {
    void (async () => {
      const result = await tryOnThisPage(
        typeof message.category === 'string' ? (message.category as GarmentCategory) : undefined,
      );
      sendResponse(result);
    })();
    return true;
  }
  return false;
});

async function tryOnThisPage(category?: GarmentCategory): Promise<{ ok: boolean; error?: string }> {
  const product = extractProductFromPage();
  const garmentImage = await captureProductImage(product.imageUrl);
  if (!garmentImage) {
    return { ok: false, error: 'This page has no product image FitMirror can use.' };
  }
  const response = (await chrome.runtime.sendMessage({
    type: 'fitmirror:try-on',
    garmentImage,
    productUrl: product.sourceUrl,
    name: product.name,
    retailer: product.retailer,
    category: category ?? product.category,
    fitGarment: product.fitGarment,
  })) as { ok?: boolean; error?: string } | undefined;
  if (!response?.ok) return { ok: false, error: response?.error || 'Try-on failed' };
  return { ok: true };
}

function ensureAvatar() {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .dock {
      position: fixed; z-index: 2147483646; right: 16px; bottom: 16px;
      width: 176px; font-family: ui-sans-serif, system-ui, sans-serif; color: #142028;
      pointer-events: auto;
    }
    .card {
      background: #f7f9fb; border: 1px solid #c5ced6; border-radius: 14px;
      box-shadow: 0 12px 36px rgba(20,32,40,.2); overflow: hidden;
    }
    .avatar {
      width: 100%; height: 220px; object-fit: contain; background: #e8eef3; display: block;
    }
    .empty {
      height: 220px; display: flex; align-items: center; justify-content: center;
      padding: 12px; text-align: center; font-size: 12px; color: #5c6b76; background: #e8eef3;
    }
    .body { padding: 8px; }
    .name { margin: 0 0 6px; font-size: 11px; line-height: 1.3; color: #5c6b76; }
    button, .file {
      width: 100%; border: none; border-radius: 8px; padding: 8px; font-size: 12px; font-weight: 700;
      background: #0b6e6e; color: #f3fbfb; cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: wait; }
    .row { display: flex; gap: 4px; margin-top: 6px; }
    .row button { background: #fff; color: #142028; border: 1px solid #c5ced6; font-weight: 600; }
    .status { margin: 6px 0 0; font-size: 11px; line-height: 1.35; }
    .err { color: #b91c1c; }
    .cart { max-height: 120px; overflow: auto; margin-top: 6px; }
    .cart a { display: block; font-size: 11px; color: #0b6e6e; margin-bottom: 4px; word-break: break-all; }
    .min {
      position: fixed; right: 16px; bottom: 16px; width: auto; border-radius: 999px;
      padding: 10px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
    }
    .hidden { display: none; }
  `;
  const dock = document.createElement('div');
  dock.className = 'dock';
  shadow.append(style, dock);
  document.documentElement.appendChild(root);

  let busy = false;

  async function render() {
    const figure = await loadFigure();
    const product = extractProductFromPage();
    dock.replaceChildren();
    if (figure.avatarMinimized && (figure.avatarImageUrl || figure.modelImage)) {
      const tab = document.createElement('button');
      tab.className = 'min';
      tab.textContent = 'FitMirror';
      tab.addEventListener('click', () => {
        void setAvatarMinimized(false);
      });
      dock.append(tab);
      return;
    }
    dock.append(cardFor(figure, product.name));
  }

  function cardFor(figure: FigurePersist, productName: string) {
    const card = document.createElement('div');
    card.className = 'card';
    const look = figure.avatarImageUrl || figure.modelImage;
    if (look) {
      const img = document.createElement('img');
      img.className = 'avatar';
      img.alt = 'Your FitMirror avatar';
      img.src = look;
      card.append(img);
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Open the FitMirror side panel and add a full-body photo. It stays in this corner on every tab.';
      card.append(empty);
    }

    const body = document.createElement('div');
    body.className = 'body';
    const name = document.createElement('p');
    name.className = 'name';
    name.textContent = productName ? `This page: ${productName}` : 'Open a product page';
    body.append(name);

    const wear = document.createElement('button');
    wear.type = 'button';
    wear.textContent = busy ? 'Generating…' : 'Try this on';
    wear.disabled = busy || !figure.modelImage;
    wear.addEventListener('click', () => {
      void run(wear);
    });
    body.append(wear);

    const status = document.createElement('p');
    status.className = 'status';
    body.append(status);

    if (figure.liked.length > 0) {
      const cart = document.createElement('div');
      cart.className = 'cart';
      for (const item of figure.liked.slice(0, 8)) {
        const link = document.createElement('a');
        link.href = item.productUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = item.name;
        cart.append(link);
      }
      body.append(cart);
    }

    const row = document.createElement('div');
    row.className = 'row';
    if (look) {
      const hide = document.createElement('button');
      hide.type = 'button';
      hide.textContent = 'Hide';
      hide.addEventListener('click', () => {
        void setAvatarMinimized(true);
      });
      row.append(hide);
    }
    body.append(row);
    card.append(body);
    return card;
  }

  async function run(button: HTMLButtonElement) {
    busy = true;
    button.disabled = true;
    button.textContent = 'Generating…';
    const status = shadow.querySelector('.status');
    if (status) {
      status.textContent = 'Calling try-on…';
      status.classList.remove('err');
    }
    const result = await tryOnThisPage();
    busy = false;
    await render();
    if (!result.ok) {
      const next = shadow.querySelector('.status');
      if (next) {
        next.textContent = result.error || 'Try-on failed';
        next.classList.add('err');
      }
    }
  }

  function placeTryOnBadge() {
    document.getElementById('fitmirror-tryon-badge')?.remove();
    const product = extractProductFromPage();
    if (!product.imageUrl) return;
    const img = [...document.images].find((el) => {
      const src = el.currentSrc || el.src;
      if (!src || src.startsWith('data:')) return false;
      return src === product.imageUrl || src.includes(product.imageUrl!) || product.imageUrl!.includes(src);
    });
    if (!img) return;
    const badge = document.createElement('button');
    badge.id = 'fitmirror-tryon-badge';
    badge.type = 'button';
    badge.textContent = 'Try on';
    badge.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      'border:none',
      'border-radius:999px',
      'padding:6px 10px',
      'font:700 12px ui-sans-serif, system-ui',
      'background:#0b6e6e',
      'color:#f3fbfb',
      'cursor:pointer',
      'box-shadow:0 6px 16px rgba(0,0,0,.2)',
    ].join(';');
    const move = () => {
      const rect = img.getBoundingClientRect();
      if (rect.width < 40 || rect.bottom < 0 || rect.top > window.innerHeight) {
        badge.style.display = 'none';
        return;
      }
      badge.style.display = 'block';
      badge.style.top = `${Math.max(8, rect.top + 8)}px`;
      badge.style.left = `${Math.max(8, rect.left + 8)}px`;
    };
    move();
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      busy = true;
      void (async () => {
        await render();
        const result = await tryOnThisPage();
        busy = false;
        await render();
        if (!result.ok) {
          const next = shadow.querySelector('.status');
          if (next) {
            next.textContent = result.error || 'Try-on failed';
            next.classList.add('err');
          }
        }
      })();
    });
    window.addEventListener('scroll', move, { passive: true });
    window.addEventListener('resize', move);
    document.documentElement.append(badge);
  }

  chrome.storage.onChanged.addListener(() => {
    void render();
  });
  void render();
  placeTryOnBadge();
  window.setTimeout(placeTryOnBadge, 1500);
}

ensureAvatar();
