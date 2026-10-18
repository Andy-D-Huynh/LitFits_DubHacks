import { captureProductImage, extractProductFromPage } from '../lib/extract-product';
import { fileToModelImage } from '../lib/photo';
import {
  consumePendingCartAdd,
  deleteGeneratedLook,
  loadFigure,
  markAllInCart,
  rememberBrowsedProduct,
  removeBrowsedProduct,
  removeGarment,
  restoreGeneratedLook,
  setAvatarMinimized,
  setModelPhoto,
  toggleCart,
} from '../lib/storage';
import type { BrowsedProduct, FigurePersist, GarmentCategory, LikedGarment } from '../lib/types';
import { aiAddToCart } from './ai-cart';
import { maybeSyncStudio } from './studio-sync';

maybeSyncStudio();

const ROOT_ID = 'fitmirror-avatar-root';

let lastSavedUrl = '';
function maybeCacheCurrentProduct() {
  const product = extractProductFromPage();
  const url = product.sourceUrl || location.href;
  if (!product.imageUrl || !product.name || lastSavedUrl === url) return;
  lastSavedUrl = url;
  void rememberBrowsedProduct({
    id: crypto.randomUUID(),
    productUrl: url,
    name: product.name,
    imageUrl: product.imageUrl,
    retailer: product.retailer,
    category: product.category,
    visitedAt: new Date().toISOString(),
  });
}

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

async function tryOnProduct(
  garmentImageUrl: string,
  productUrl: string,
  name: string,
  retailer?: string | null,
  category?: GarmentCategory,
  fit?: string,
  color?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const garmentImage = await captureProductImage(garmentImageUrl);
  if (!garmentImage) {
    return { ok: false, error: 'No product image found.' };
  }
  const response = (await chrome.runtime.sendMessage({
    type: 'fitmirror:try-on',
    garmentImage,
    productUrl,
    name,
    retailer: retailer ?? null,
    category: category ?? 'auto',
    fit: fit ?? 'regular',
    color: color ?? null,
  })) as { ok?: boolean; error?: string } | undefined;
  if (!response?.ok) return { ok: false, error: response?.error || 'Try-on failed' };
  return { ok: true };
}

async function tryOnThisPage(
  category?: GarmentCategory,
  fit?: string,
): Promise<{ ok: boolean; error?: string }> {
  const product = extractProductFromPage();
  if (!product.imageUrl) {
    return { ok: false, error: 'No product image found on this page.' };
  }
  return tryOnProduct(
    product.imageUrl,
    product.sourceUrl,
    product.name,
    product.retailer,
    category ?? product.category,
    fit,
    product.color,
  );
}

function cleanSiteName(item: { retailer?: string | null; productUrl: string }): string {
  if (item.retailer && item.retailer.trim()) return item.retailer.trim();
  try {
    const host = new URL(item.productUrl).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    return parts.length >= 2 && parts[0] ? parts[0] : host;
  } catch {
    return 'Store';
  }
}

function formatCategoryLabel(category: GarmentCategory, name?: string): string {
  const n = (name || '').toLowerCase();
  if (category === 'bottom') {
    if (/\b(jean|jeans|denim)\b/.test(n)) return 'Jeans';
    if (/\b(short|shorts)\b/.test(n)) return 'Shorts';
    if (/\b(skirt|skirts)\b/.test(n)) return 'Skirt';
    return 'Bottom';
  }
  if (category === 'outerwear') {
    if (/\b(jacket|jackets)\b/.test(n)) return 'Jacket';
    if (/\b(coat|coats)\b/.test(n)) return 'Coat';
    if (/\b(blazer|blazers)\b/.test(n)) return 'Blazer';
    if (/\b(hoodie|hoodies)\b/.test(n)) return 'Hoodie';
    return 'Jacket';
  }
  if (category === 'dress') return 'Dress';
  if (category === 'footwear') return 'Shoes';
  if (category === 'accessory') return 'Accessory';
  if (/\b(shirt|shirts|tee|tees|t-shirt)\b/.test(n)) return 'Shirt';
  return 'Top';
}

function isCurrentPage(url: string): boolean {
  try {
    const cur = new URL(location.href);
    const target = new URL(url);
    const curHost = cur.hostname.replace(/^www\./, '').toLowerCase();
    const targetHost = target.hostname.replace(/^www\./, '').toLowerCase();
    const curPath = cur.pathname.replace(/\/$/, '').toLowerCase();
    const targetPath = target.pathname.replace(/\/$/, '').toLowerCase();
    return curHost === targetHost && curPath === targetPath;
  } catch {
    return false;
  }
}

/** Display an on-screen toast notification confirming cart actions */
function showToastNotification(text: string, duration = 4000, isSuccess = false) {
  try {
    let toast = document.getElementById('fitmirror-toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'fitmirror-toast-notification';
      document.documentElement.appendChild(toast);
    }
    toast.style.cssText = [
      'position: fixed',
      'z-index: 2147483647',
      'top: 24px',
      'right: 24px',
      'background: rgba(15, 23, 42, 0.95)',
      'backdrop-filter: blur(12px)',
      '-webkit-backdrop-filter: blur(12px)',
      'color: #ffffff',
      `border: 1px solid ${isSuccess ? 'rgba(34, 197, 94, 0.7)' : 'rgba(255, 255, 255, 0.2)'}`,
      `box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4)${isSuccess ? ', 0 0 16px rgba(34, 197, 94, 0.35)' : ''}`,
      'border-radius: 999px',
      'padding: 10px 20px',
      'font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'display: flex',
      'align-items: center',
      'gap: 8px',
      'transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      'opacity: 0',
      'transform: translateY(-8px)',
      'pointer-events: none',
    ].join(';');

    toast.textContent = text;
    requestAnimationFrame(() => {
      if (toast) {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      }
    });

    window.setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
        window.setTimeout(() => toast?.remove(), 300);
      }
    }, duration);
  } catch {}
}

/** Check and auto-select product size if mandatory on this store */
function autoSelectSizeIfRequired(): boolean {
  // 1. Check native select dropdowns (Shopify, standard stores)
  const sizeSelects = Array.from(
    document.querySelectorAll<HTMLSelectElement>(
      'select[name*="size" i], select[id*="size" i], select[data-testid*="size" i], select[aria-label*="size" i], select.product-form__input, select[name="id"]'
    )
  );
  for (const sel of sizeSelects) {
    if (sel.offsetParent === null) continue;
    const currentOpt = sel.options[sel.selectedIndex];
    const isPlaceholder = !currentOpt || !currentOpt.value || /select|choose/i.test(currentOpt.text);
    if (isPlaceholder) {
      for (let i = 0; i < sel.options.length; i++) {
        const opt = sel.options[i];
        if (opt.value && !opt.disabled && !/select|choose/i.test(opt.text)) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
    }
  }

  // 2. Check interactive size elements (Zara, Diesel, ASOS, Uniqlo, H&M, Shopify pill swatches)
  const sizeElements = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        'button[data-qa-action*="size"]:not([disabled])',
        'button[data-qa-action="size-in-stock"]',
        '.size-selector button:not([disabled])',
        '.size-selector a:not([disabled])',
        '[data-testid*="size"] button:not([disabled])',
        '[data-test*="size"] button:not([disabled])',
        'ul.sizes button:not([disabled])',
        'ul.sizes li:not(.disabled):not(.out-of-stock) button',
        '.swatches--size button:not([disabled])',
        '.swatches.size button:not([disabled])',
        '.swatches.size a:not([disabled])',
        '[class*="size-picker" i] button:not([disabled])',
        '[class*="size-selector" i] button:not([disabled])',
        '[class*="size-attribute" i] button:not([disabled])',
        '[data-attr="size"] button:not([disabled])',
        '[data-attr="size"] a:not([disabled])',
        '[role="radiogroup"] [role="radio"]:not([aria-disabled="true"])',
        'input[type="radio"][name*="size" i]:not([disabled]) + label',
        'input[type="radio"][name*="Size" i]:not([disabled]) + label',
        '.product-form__input--pill input:not([disabled]) + label',
      ].join(', ')
    )
  ).filter((el) => el.offsetParent !== null);

  if (sizeElements.length > 0) {
    const hasSelected = sizeElements.some((el) => {
      if (el.classList.contains('active') || el.classList.contains('selected')) return true;
      if (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true') return true;
      if (el.hasAttribute('data-selected') || el.getAttribute('data-active') === 'true') return true;
      const prev = el.previousElementSibling as HTMLInputElement | null;
      if (prev && prev.tagName === 'INPUT' && prev.type === 'radio' && prev.checked) return true;
      return false;
    });

    if (!hasSelected) {
      const target = sizeElements[0];
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const opts = { bubbles: true, cancelable: true, view: window };
      target.dispatchEvent(new PointerEvent('pointerdown', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new PointerEvent('pointerup', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.click();
      return true;
    }
  }

  return false;
}

function isClickableButton(el: HTMLElement): boolean {
  if (el.offsetParent === null) return false;
  if (el.hasAttribute('disabled')) return false;
  if (el.classList.contains('disabled')) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

/** Wishlist hearts and similar sit right next to "Add to bag" and often share its classes. */
function isNotCartAction(el: HTMLElement): boolean {
  const haystack = [
    el.innerText || el.textContent || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('title') || '',
    el.id,
    el.className?.toString() || '',
  ].join(' ');
  return /wish|favou?rite|save for later|saved|heart|share|notify|size guide|find in store/i.test(haystack);
}

function findAddToCartButton(): { btn: HTMLElement | null; disabledBtn: HTMLElement | null } {
  const selectors = [
    // Zara
    'button[data-qa-action="add-to-cart"]',
    'button[data-qa="product-add-to-cart-button"]',
    // Uniqlo
    'button[data-test="add-to-cart"]',
    '#add-to-cart-btn',
    '.button-add-to-cart',
    // ASOS
    'button[data-testid="add-button"]',
    'button[data-test-id="add-button"]',
    // H&M
    'button[data-testid="add-to-bag-button"]',
    '.add-to-bag',
    // Diesel & Salesforce Commerce Cloud
    'button.add-to-cart',
    'button[data-add-to-cart]',
    '.add-to-cart-global button',
    '.add-to-cart-btn',
    'button.add-to-cart-button',
    // Shopify & general
    'button[name="add"]',
    'form[action*="/cart/add"] button[type="submit"]',
    'form[action*="/cart/add"] input[type="submit"]',
    'button.product-form__submit',
    '.product-form__cart-submit',
    '.add-to-cart',
    '.add-to-bag',
    '#add-to-cart-button',
    'button[id*="add-to-cart" i]',
    'button[id*="add-to-bag" i]',
    'button[class*="add-to-cart" i]',
    'button[class*="add-to-bag" i]',
    'button[aria-label*="add to bag" i]',
    'button[aria-label*="add to cart" i]',
    'button[aria-label*="add to basket" i]',
    'button[data-testid*="add-to-cart" i]',
    'button[data-testid*="add-to-bag" i]',
    'button[data-test*="add-to-cart" i]',
    'button[data-qa*="add-to-cart" i]',
  ];

  let btn: HTMLElement | null = null;
  let disabledBtn: HTMLElement | null = null;

  for (const sel of selectors) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(sel));
    for (const el of elements) {
      if (el.id === 'fitmirror-tryon-badge' || el.closest('#fitmirror-avatar-root')) continue;
      if (isNotCartAction(el)) continue;
      if (isClickableButton(el)) {
        btn = el;
        break;
      } else if (el.offsetParent !== null) {
        disabledBtn = disabledBtn || el;
      }
    }
    if (btn) break;
  }

  if (!btn) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('button, a, input[type="submit"], div[role="button"]')
    );
    for (const el of candidates) {
      if (el.id === 'fitmirror-tryon-badge' || el.closest('#fitmirror-avatar-root')) continue;
      const text = (el.innerText || el.textContent || el.getAttribute('value') || '').trim();
      if (
        /^(add to (bag|cart|basket)|añadir a la cesta|ajouter au panier|in den warenkorb|加入购物车|ใส่ตะกร้า)$/i.test(
          text
        ) ||
        (/add to (bag|cart|basket)/i.test(text) && text.length < 35)
      ) {
        if (isClickableButton(el)) {
          btn = el;
          break;
        } else if (el.offsetParent !== null) {
          disabledBtn = disabledBtn || el;
        }
      }
    }
  }

  return { btn, disabledBtn };
}

function clickAddToCartButton(btn: HTMLElement) {
  btn.focus();
  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const opts = { bubbles: true, cancelable: true, view: window };
  btn.dispatchEvent(new PointerEvent('pointerdown', opts));
  btn.dispatchEvent(new MouseEvent('mousedown', opts));
  btn.dispatchEvent(new PointerEvent('pointerup', opts));
  btn.dispatchEvent(new MouseEvent('mouseup', opts));
  btn.click();

  const form = btn.closest('form');
  if (form && (btn.getAttribute('type') === 'submit' || !btn.getAttribute('type'))) {
    try {
      form.requestSubmit(btn);
    } catch {
      try {
        form.submit();
      } catch {}
    }
  }
}

let autoCartActive = false;

/** Poll and retry until the store button renders and is enabled */
async function runAutoAddToCartWithRetry(
  maxWaitMs = 10000
): Promise<{ success: boolean; message: string }> {
  if (autoCartActive) return { success: false, message: 'Already adding to cart...' };
  autoCartActive = true;

  showToastNotification('FitMirror: Adding item to shopping bag...', 3500);

  const startTime = Date.now();
  let sizeClicked = false;
  // Give the page a moment to render before paying for a Gemini call.
  const aiAfterMs = Math.min(2500, maxWaitMs / 2);
  let aiTried = false;

  while (Date.now() - startTime < maxWaitMs) {
    if (!aiTried && Date.now() - startTime >= aiAfterMs) {
      aiTried = true;
      showToastNotification('FitMirror: Reading the page to find the add button...', 4000);
      const ai = await aiAddToCart(extractProductFromPage().name, clickAddToCartButton);
      if (ai.clicked) {
        showToastNotification(`✓ Clicked "${ai.text ?? 'Add to cart'}"`, 4500, true);
        autoCartActive = false;
        return { success: true, message: 'Added to your store bag!' };
      }
      console.warn('[FitMirror] AI add-to-cart fallback:', ai.error);
    }

    if (!sizeClicked) {
      const didSelect = autoSelectSizeIfRequired();
      if (didSelect) {
        sizeClicked = true;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    const { btn } = findAddToCartButton();
    if (btn) {
      clickAddToCartButton(btn);
      showToastNotification('✓ Added to your shopping bag!', 4500, true);
      autoCartActive = false;
      return { success: true, message: 'Added to your store bag!' };
    }

    if (!sizeClicked) {
      const didSelect = autoSelectSizeIfRequired();
      if (didSelect) {
        sizeClicked = true;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  const { disabledBtn } = findAddToCartButton();
  if (disabledBtn) {
    disabledBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToastNotification('FitMirror: Please select your size to finish adding to cart', 6000, false);
    autoCartActive = false;
    return {
      success: false,
      message: 'Please select your size on the store page to finish adding to cart.',
    };
  }

  showToastNotification('FitMirror: Could not find "Add to Cart" button', 5000, false);
  autoCartActive = false;
  return {
    success: false,
    message: 'Could not find "Add to Cart" button on this store page.',
  };
}

/** Automatically trigger the retailer's real "Add to Bag" / "Add to Cart" button */
function triggerStoreAddToCart(): { success: boolean; message: string } {
  autoSelectSizeIfRequired();
  const { btn, disabledBtn } = findAddToCartButton();
  if (btn) {
    clickAddToCartButton(btn);
    return { success: true, message: 'Added to your store bag!' };
  }
  if (disabledBtn) {
    disabledBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return {
      success: false,
      message: 'Please choose your size on the store page to finish adding to cart.',
    };
  }
  return {
    success: false,
    message: 'Could not find "Add to Cart" button on this store page.',
  };
}

const SVG_MINIMIZE = `
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="5" y1="12" x2="19" y2="12"/>
</svg>
`;

const SVG_EXPAND = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 3 21 3 21 9"/>
  <polyline points="9 21 3 21 3 15"/>
  <line x1="21" y1="3" x2="14" y2="10"/>
  <line x1="3" y1="21" x2="10" y2="14"/>
</svg>
`;

const SVG_ZOOM_IN = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="11" cy="11" r="8"/>
  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  <line x1="11" y1="8" x2="11" y2="14"/>
  <line x1="8" y1="11" x2="14" y2="11"/>
</svg>
`;

const SVG_HANGER = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2a3 3 0 0 0-3 3c0 1.3.8 2.4 2 2.8V9L2 17h20L13 9V7.8c1.2-.4 2-1.5 2-2.8a3 3 0 0 0-3-3z"/>
  <path d="M2 17v2a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2"/>
</svg>
`;

const SVG_REMOVE = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 6h18"/>
  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
  <line x1="10" y1="11" x2="10" y2="17"/>
  <line x1="14" y1="11" x2="14" y2="17"/>
</svg>
`;

const SVG_CART = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="8" cy="21" r="1"/>
  <circle cx="19" cy="21" r="1"/>
  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
</svg>
`;

const SVG_CART_ACTIVE = `
<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="8" cy="21" r="1" fill="#059669"/>
  <circle cx="19" cy="21" r="1" fill="#059669"/>
  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
  <polyline points="9 11 12 14 17 9"/>
</svg>
`;

const SVG_UPLOAD = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
  <circle cx="12" cy="13" r="4"/>
</svg>
`;

function ensureAvatar() {
  if (location.pathname.startsWith('/studio')) return;
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  const shadow = root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .dock {
      position: fixed;
      z-index: 2147483646;
      right: 20px;
      bottom: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      pointer-events: auto;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }

    /* Minimized Avatar Bubble */
    .min-bubble {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid #ffffff;
      box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.06);
      overflow: hidden;
      cursor: pointer;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
      pointer-events: auto !important;
      user-select: none;
    }
    .min-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 14px 30px -4px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.08);
    }
    .min-avatar {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
      -webkit-user-drag: none;
      user-select: none;
    }
    .min-badge {
      position: absolute;
      top: 1px;
      right: 1px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 999px;
      background: #0f172a;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
      box-sizing: border-box;
      pointer-events: none;
    }

    /* Minimalist Expanded Card */
    .card {
      width: 236px;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 18px;
      box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(15, 23, 42, 0.04);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: fadeIn 0.16s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Avatar Container */
    .avatar-container {
      position: relative;
      width: 100%;
      height: 250px;
      background: #f1f5f9;
      overflow: hidden;
    }
    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .btn-minimize {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(8px);
      border: none;
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.15s;
      z-index: 2;
    }
    .btn-minimize:hover {
      background: rgba(15, 23, 42, 0.8);
      transform: scale(1.05);
    }
    .btn-expand {
      position: absolute;
      top: 8px;
      right: 38px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(8px);
      border: none;
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.15s;
      z-index: 2;
    }
    .btn-expand:hover {
      background: rgba(15, 23, 42, 0.85);
      transform: scale(1.05);
    }
    .avatar-zoom-hint {
      position: absolute;
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      color: #ffffff;
      font-size: 10px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 999px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
      white-space: nowrap;
      z-index: 2;
    }
    .avatar-container:hover .avatar-zoom-hint {
      opacity: 1;
    }

    /* Fullscreen Modal Lightbox */
    .lightbox-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(15, 23, 42, 0.82);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      animation: modalFadeIn 0.2s ease-out;
    }
    @keyframes modalFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .lightbox-modal {
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.55);
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
      animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalScale {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .lightbox-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      background: #fafafa;
    }
    .lightbox-title {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .lightbox-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .lightbox-btn {
      border: none;
      background: #f1f5f9;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .lightbox-btn:hover { background: #e2e8f0; color: #0f172a; }
    .lightbox-close {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: none;
      background: #e2e8f0;
      color: #475569;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .lightbox-close:hover { background: #cbd5e1; color: #0f172a; }
    .lightbox-body {
      position: relative;
      background: #090d16;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      max-height: calc(90vh - 60px);
      padding: 16px;
    }
    .lightbox-img {
      max-height: 76vh;
      max-width: 80vw;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 12px;
      cursor: zoom-in;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .lightbox-img.zoomed {
      transform: scale(1.75);
      cursor: zoom-out;
    }

    /* Empty / Upload State */
    .empty-state {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      gap: 10px;
      padding: 16px;
      box-sizing: border-box;
      cursor: pointer;
    }
    .empty-btn {
      border: none;
      background: #0f172a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 999px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: opacity 0.15s;
    }
    .empty-btn:hover { opacity: 0.9; }

    /* Loading Overlay */
    .loading-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      z-index: 3;
      gap: 8px;
    }
    .spinner {
      width: 22px;
      height: 22px;
      border: 2.5px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Fit Style Dropdown Bar */
    .fit-select-bar {
      padding: 6px 8px 4px;
      background: #ffffff;
      border-top: 1px solid rgba(0, 0, 0, 0.05);
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .fit-select {
      width: 100%;
      background: #f8fafc;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .fit-select:focus, .fit-select:hover {
      border-color: #0f172a;
      background: #ffffff;
    }

    /* Quick Action Bar (Try On / Remove) */
    .tryon-bar {
      padding: 4px 8px 8px;
      background: #ffffff;
      display: flex;
      gap: 6px;
    }
    .tryon-btn {
      flex: 1;
      border: none;
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 600;
      background: #0f172a;
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: background 0.15s, opacity 0.15s;
    }
    .tryon-btn:hover { background: #1e293b; }
    .tryon-btn:disabled { opacity: 0.6; cursor: wait; }

    .tryon-btn-remove {
      flex: 1;
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 11px;
      font-weight: 600;
      background: #fef2f2;
      color: #dc2626;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: background 0.15s, color 0.15s;
    }
    .tryon-btn-remove:hover {
      background: #fee2e2;
      color: #b91c1c;
    }

    /* Tabs Switcher */
    .tabs-header {
      display: flex;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      background: #f8fafc;
      padding: 3px 6px;
      gap: 4px;
    }
    .tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      padding: 5px 4px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s, color 0.15s;
    }
    .tab-btn:hover {
      color: #0f172a;
      background: rgba(0, 0, 0, 0.04);
    }
    .tab-btn.active {
      color: #0f172a;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    }

    /* Clothes / History List */
    .clothes-list {
      max-height: 155px;
      overflow-y: auto;
      padding: 6px 8px 6px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      background: #ffffff;
    }
    .clothes-list::-webkit-scrollbar {
      width: 4px;
    }
    .clothes-list::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
    .clothing-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 6px;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid rgba(0, 0, 0, 0.04);
      gap: 6px;
    }
    .clothing-thumb {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      object-fit: cover;
      background: #e2e8f0;
      flex-shrink: 0;
    }
    .clothing-meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .clothing-site {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      line-height: 1.1;
    }
    .clothing-name {
      font-size: 11px;
      font-weight: 500;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.25;
      text-decoration: none;
    }
    .clothing-name:hover {
      color: #0284c7;
    }
    .clothing-actions {
      display: flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
    }
    .action-btn {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 0.15s, color 0.15s, transform 0.15s;
    }
    .action-btn:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #0f172a;
      transform: scale(1.06);
    }
    .action-btn.btn-remove:hover {
      color: #ef4444;
      background: #fee2e2;
    }
    .action-btn.btn-cart.in-cart {
      color: #059669;
      background: #ecfdf5;
    }
    .action-btn.btn-cart.in-cart:hover {
      background: #d1fae5;
    }

    /* Put All In Cart Button */
    .cart-all-container {
      padding: 4px 8px 8px;
      background: #ffffff;
      border-top: 1px solid rgba(0, 0, 0, 0.04);
    }
    .btn-cart-all {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 999px;
      padding: 7px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
    }
    .btn-cart-all:hover {
      background: #1e293b;
      transform: translateY(-1px);
    }
    .btn-cart-all.all-in {
      background: #ecfdf5;
      color: #059669;
      border: 1px solid rgba(5, 150, 105, 0.2);
    }

    .empty-tab-hint {
      padding: 16px 12px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
    }

    .card-error-banner {
      background: #fef2f2;
      border-top: 1px solid #fee2e2;
      border-bottom: 1px solid #fee2e2;
      color: #b91c1c;
      font-size: 11px;
      line-height: 1.35;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .card-error-close {
      border: none;
      background: transparent;
      color: #991b1b;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      flex-shrink: 0;
    }

    .card-info-banner {
      background: #ecfdf5;
      border-top: 1px solid #d1fae5;
      border-bottom: 1px solid #d1fae5;
      color: #065f46;
      font-size: 11px;
      line-height: 1.35;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .card-info-close {
      border: none;
      background: transparent;
      color: #065f46;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      flex-shrink: 0;
    }
  `;
  const dock = document.createElement('div');
  dock.className = 'dock';
  shadow.append(style, dock);
  document.documentElement.appendChild(root);

  let busy = false;
  let activeTab: 'worn' | 'looks' | 'saved' = 'worn';
  let errorMessage: string | null = null;
  let infoMessage: string | null = null;
  let selectedFit: 'regular' | 'baggy' | 'tight' | 'oversized' | 'cropped' = 'regular';
  let currentCategoryOverride: GarmentCategory | null = null;

  function openLightbox(imageUrl: string) {
    shadow.querySelector('.lightbox-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';

    const modal = document.createElement('div');
    modal.className = 'lightbox-modal';

    const header = document.createElement('div');
    header.className = 'lightbox-header';

    const title = document.createElement('div');
    title.className = 'lightbox-title';
    title.innerHTML = `<span>Outfit Inspection</span> <span style="font-size: 11px; font-weight: normal; color: #64748b;">(Click image or button to zoom 2x)</span>`;

    const actions = document.createElement('div');
    actions.className = 'lightbox-actions';

    const btnZoom = document.createElement('button');
    btnZoom.type = 'button';
    btnZoom.className = 'lightbox-btn';
    btnZoom.innerHTML = `${SVG_ZOOM_IN} Zoom 2x`;

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'lightbox-close';
    btnClose.innerHTML = '×';
    btnClose.title = 'Close (Esc)';

    actions.append(btnZoom, btnClose);
    header.append(title, actions);

    const body = document.createElement('div');
    body.className = 'lightbox-body';

    const img = document.createElement('img');
    img.className = 'lightbox-img';
    img.src = imageUrl;
    img.alt = 'Avatar full resolution view';

    let isZoomed = false;
    const toggleZoom = () => {
      isZoomed = !isZoomed;
      img.classList.toggle('zoomed', isZoomed);
      btnZoom.innerHTML = isZoomed ? 'Reset Zoom' : `${SVG_ZOOM_IN} Zoom 2x`;
    };

    img.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleZoom();
    });
    btnZoom.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleZoom();
    });

    body.append(img);
    modal.append(header, body);
    overlay.append(modal);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
      }
    });

    document.addEventListener('keydown', onKeyDown);
    shadow.append(overlay);
  }

  async function render() {
    maybeCacheCurrentProduct();
    const figure = await loadFigure();
    const product = extractProductFromPage();
    dock.replaceChildren();

    const look = figure.avatarImageUrl || figure.modelImage;

    // Minimized state: just the avatar circle
    if (figure.avatarMinimized && look) {
      const bubble = document.createElement('div');
      bubble.className = 'min-bubble';
      bubble.title = 'Show avatar';

      const img = document.createElement('img');
      img.className = 'min-avatar';
      img.src = look;
      img.alt = 'Avatar';
      bubble.append(img);

      if (figure.liked.length > 0) {
        const badge = document.createElement('div');
        badge.className = 'min-badge';
        badge.textContent = String(figure.liked.length);
        bubble.append(badge);
      }

      bubble.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        figure.avatarMinimized = false;
        void setAvatarMinimized(false);
        void render();
      });
      dock.append(bubble);
      return;
    }

    // Expanded minimalist card
    const card = document.createElement('div');
    card.className = 'card';

    // 1. Avatar Container
    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'avatar-container';

    if (look) {
      const img = document.createElement('img');
      img.className = 'avatar-img';
      img.src = look;
      img.alt = 'Avatar';
      img.title = 'Click to look closer / zoom in';
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(look);
      });
      avatarContainer.append(img);

      // Expand / Look closer button
      const btnExpand = document.createElement('button');
      btnExpand.className = 'btn-expand';
      btnExpand.title = 'Look closer / Zoom in';
      btnExpand.innerHTML = SVG_EXPAND;
      btnExpand.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(look);
      });
      avatarContainer.append(btnExpand);

      // Zoom hint badge
      const zoomHint = document.createElement('div');
      zoomHint.className = 'avatar-zoom-hint';
      zoomHint.textContent = '🔍 Click to look closer';
      avatarContainer.append(zoomHint);

      // Minimize button
      const btnMin = document.createElement('button');
      btnMin.className = 'btn-minimize';
      btnMin.title = 'Minimize';
      btnMin.innerHTML = SVG_MINIMIZE;
      btnMin.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        figure.avatarMinimized = true;
        void setAvatarMinimized(true);
        void render();
      });
      avatarContainer.append(btnMin);
    } else {
      // Empty state: clean upload trigger
      const empty = document.createElement('div');
      empty.className = 'empty-state';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/jpeg,image/png,image/webp';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        void (async () => {
          try {
            const dataUrl = await fileToModelImage(file);
            await setModelPhoto(dataUrl, null);
            await render();
          } catch (e) {
            console.error(e);
          }
        })();
      });

      const btnUpload = document.createElement('button');
      btnUpload.className = 'empty-btn';
      btnUpload.innerHTML = `${SVG_UPLOAD} Add photo`;
      btnUpload.addEventListener('click', () => fileInput.click());

      empty.append(fileInput, btnUpload);
      avatarContainer.append(empty);
    }

    // Loading overlay when generating
    if (busy) {
      const loader = document.createElement('div');
      loader.className = 'loading-overlay';
      const spin = document.createElement('div');
      spin.className = 'spinner';
      loader.append(spin);
      avatarContainer.append(loader);
    }

    card.append(avatarContainer);

    // Error banner (if try-on failed or needs photo)
    if (errorMessage) {
      const errBox = document.createElement('div');
      errBox.className = 'card-error-banner';
      const msgSpan = document.createElement('span');
      msgSpan.textContent = errorMessage;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'card-error-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Dismiss';
      closeBtn.addEventListener('click', () => {
        errorMessage = null;
        void render();
      });
      errBox.append(msgSpan, closeBtn);
      card.append(errBox);
    }

    // Success / Info banner
    if (infoMessage) {
      const infoBox = document.createElement('div');
      infoBox.className = 'card-info-banner';
      const msgSpan = document.createElement('span');
      msgSpan.textContent = infoMessage;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'card-info-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Dismiss';
      closeBtn.addEventListener('click', () => {
        infoMessage = null;
        void render();
      });
      infoBox.append(msgSpan, closeBtn);
      card.append(infoBox);
    }

    // Check if current page product is currently worn on figure
    const currentWorn = figure.liked.find(
      (item) =>
        (product.sourceUrl && item.productUrl === product.sourceUrl) ||
        (product.name && item.name.toLowerCase() === product.name.toLowerCase()),
    );

    // 2. Quick Action Bar (Try on or Remove)
    if (product.imageUrl && figure.modelImage && !busy) {
      if (!currentWorn) {
        const fitBar = document.createElement('div');
        fitBar.className = 'fit-select-bar';

        const activeCategory = currentCategoryOverride ?? product.category;

        // 1. Category Selector (Top, Bottom, Jacket, Dress)
        const catSelect = document.createElement('select');
        catSelect.className = 'fit-select';
        catSelect.style.flex = '1';
        catSelect.title = 'Choose item category to try on';

        const catOptions: Array<{ value: GarmentCategory; label: string }> = [
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'outerwear', label: 'Jacket' },
          { value: 'dress', label: 'Dress' },
        ];

        for (const opt of catOptions) {
          const optEl = document.createElement('option');
          optEl.value = opt.value;
          optEl.textContent = opt.value === product.category ? `${opt.label} (auto)` : opt.label;
          if (opt.value === activeCategory) optEl.selected = true;
          catSelect.append(optEl);
        }

        catSelect.addEventListener('change', () => {
          currentCategoryOverride = catSelect.value as GarmentCategory;
          void render();
          void placeTryOnBadge();
        });

        // 2. Fit Style Selector (Regular, Baggy, Tight, Oversized, Cropped)
        const fitSelect = document.createElement('select');
        fitSelect.className = 'fit-select';
        fitSelect.style.flex = '1';
        fitSelect.title = 'Choose fit style for this item';

        const fitOptions = [
          { value: 'regular', label: 'Regular' },
          { value: 'baggy', label: 'Baggy' },
          { value: 'tight', label: 'Tight' },
          { value: 'oversized', label: 'Oversized' },
          { value: 'cropped', label: 'Cropped' },
        ];

        for (const opt of fitOptions) {
          const optEl = document.createElement('option');
          optEl.value = opt.value;
          optEl.textContent = opt.label;
          if (opt.value === selectedFit) optEl.selected = true;
          fitSelect.append(optEl);
        }

        fitSelect.addEventListener('change', () => {
          selectedFit = fitSelect.value as typeof selectedFit;
        });

        fitBar.append(catSelect, fitSelect);
        card.append(fitBar);
      }

      const tryonBar = document.createElement('div');
      tryonBar.className = 'tryon-bar';

      if (currentWorn) {
        // Remove button for current product
        const btnRemoveThis = document.createElement('button');
        btnRemoveThis.type = 'button';
        btnRemoveThis.className = 'tryon-btn-remove';
        btnRemoveThis.innerHTML = `${SVG_REMOVE} Remove`;
        btnRemoveThis.title = 'Remove this product from your avatar';
        btnRemoveThis.addEventListener('click', () => {
          void (async () => {
            await removeGarment(currentWorn.id);
            await render();
            placeTryOnBadge();
          })();
        });
        tryonBar.append(btnRemoveThis);

        // Also allow re-trying
        const btnRetry = document.createElement('button');
        btnRetry.type = 'button';
        btnRetry.className = 'tryon-btn';
        btnRetry.innerHTML = `${SVG_HANGER} Try again`;
        btnRetry.addEventListener('click', () => {
          void triggerTryOn();
        });
        tryonBar.append(btnRetry);
      } else {
        const activeCategory = currentCategoryOverride ?? product.category;
        const catLabel = formatCategoryLabel(activeCategory, product.name);

        const tryonBtn = document.createElement('button');
        tryonBtn.type = 'button';
        tryonBtn.className = 'tryon-btn';
        tryonBtn.innerHTML = `${SVG_HANGER} Try on ${catLabel}`;
        tryonBtn.title = `Try on as ${catLabel}`;
        tryonBtn.addEventListener('click', () => {
          void triggerTryOn();
        });
        tryonBar.append(tryonBtn);
      }

      card.append(tryonBar);
    }

    // 3. Tabs: Worn clothes vs Generated Looks vs Saved/Browsed History
    const hasWorn = figure.liked.length > 0;
    const hasSaved = figure.browsedProducts.length > 0;
    const hasLooks = Boolean(figure.lookHistory && figure.lookHistory.length > 0);

    if (hasWorn || hasSaved || hasLooks) {
      const tabsHeader = document.createElement('div');
      tabsHeader.className = 'tabs-header';

      const tabWorn = document.createElement('button');
      tabWorn.type = 'button';
      tabWorn.className = `tab-btn ${activeTab === 'worn' ? 'active' : ''}`;
      tabWorn.textContent = `Worn (${figure.liked.length})`;
      tabWorn.addEventListener('click', () => {
        activeTab = 'worn';
        void render();
      });

      const tabLooks = document.createElement('button');
      tabLooks.type = 'button';
      tabLooks.className = `tab-btn ${activeTab === 'looks' ? 'active' : ''}`;
      tabLooks.textContent = `Looks (${figure.lookHistory?.length || 0})`;
      tabLooks.title = 'Cached generated outfits (preserved even after remove)';
      tabLooks.addEventListener('click', () => {
        activeTab = 'looks';
        void render();
      });

      const tabSaved = document.createElement('button');
      tabSaved.type = 'button';
      tabSaved.className = `tab-btn ${activeTab === 'saved' ? 'active' : ''}`;
      tabSaved.textContent = `Saved (${figure.browsedProducts.length})`;
      tabSaved.addEventListener('click', () => {
        activeTab = 'saved';
        void render();
      });

      tabsHeader.append(tabWorn, tabLooks, tabSaved);
      card.append(tabsHeader);

      if (activeTab === 'worn') {
        if (figure.liked.length === 0) {
          const hint = document.createElement('div');
          hint.className = 'empty-tab-hint';
          hint.textContent = 'No clothes on avatar yet.';
          card.append(hint);
        } else {
          const list = document.createElement('div');
          list.className = 'clothes-list';

          for (const item of figure.liked) {
            const row = document.createElement('div');
            row.className = 'clothing-item';

            if (item.garmentImageUrl) {
              const thumb = document.createElement('img');
              thumb.className = 'clothing-thumb';
              thumb.src = item.garmentImageUrl;
              thumb.alt = item.name;
              row.append(thumb);
            }

            const meta = document.createElement('div');
            meta.className = 'clothing-meta';

            const site = document.createElement('div');
            site.className = 'clothing-site';
            site.textContent = cleanSiteName(item);

            const nameLink = document.createElement('a');
            nameLink.className = 'clothing-name';
            nameLink.href = item.productUrl;
            nameLink.target = '_blank';
            nameLink.rel = 'noreferrer';
            nameLink.textContent = item.name;
            nameLink.title = `${item.name} — Click to go to product page`;

            meta.append(site, nameLink);
            row.append(meta);

            const actions = document.createElement('div');
            actions.className = 'clothing-actions';

            // Real Store Cart Icon Button
            const btnCart = document.createElement('button');
            btnCart.type = 'button';
            btnCart.className = `action-btn btn-cart ${item.inCart ? 'in-cart' : ''}`;
            btnCart.title = item.inCart ? 'In cart (click to add again)' : 'Add to store cart';
            btnCart.innerHTML = item.inCart ? SVG_CART_ACTIVE : SVG_CART;
            btnCart.addEventListener('click', (e) => {
              e.stopPropagation();
              void (async () => {
                await toggleCart(item.id, true);
                if (isCurrentPage(item.productUrl)) {
                  const res = await runAutoAddToCartWithRetry(6000);
                  if (res.success) {
                    infoMessage = res.message;
                    errorMessage = null;
                  } else {
                    errorMessage = res.message;
                    infoMessage = null;
                  }
                } else {
                  void chrome.runtime.sendMessage({
                    type: 'fitmirror:open-tabs',
                    urls: [item.productUrl],
                    autoAddToCart: true,
                  });
                  infoMessage = `Opening ${cleanSiteName(item)} to add to bag...`;
                  errorMessage = null;
                }
                await render();
              })();
            });
            actions.append(btnCart);

            // Remove Icon Button
            const btnRemove = document.createElement('button');
            btnRemove.type = 'button';
            btnRemove.className = 'action-btn btn-remove';
            btnRemove.title = 'Remove from figure';
            btnRemove.innerHTML = SVG_REMOVE;
            btnRemove.addEventListener('click', (e) => {
              e.stopPropagation();
              void (async () => {
                await removeGarment(item.id);
                await render();
                placeTryOnBadge();
              })();
            });
            actions.append(btnRemove);

            row.append(actions);
            list.append(row);
          }
          card.append(list);

          // "Put All in Cart" Button
          const cartAllContainer = document.createElement('div');
          cartAllContainer.className = 'cart-all-container';

          const allInCart = figure.liked.every((i) => i.inCart);
          const btnAllCart = document.createElement('button');
          btnAllCart.type = 'button';
          btnAllCart.className = `btn-cart-all ${allInCart ? 'all-in' : ''}`;
          btnAllCart.innerHTML = `${allInCart ? SVG_CART_ACTIVE : SVG_CART} <span>${
            allInCart ? '✓ All in cart' : `Put all into cart (${figure.liked.length})`
          }</span>`;
          btnAllCart.addEventListener('click', (e) => {
            e.stopPropagation();
            void (async () => {
              await markAllInCart();

              // 1. If current page product is in the list, add it immediately on this page
              const onThisPage = figure.liked.some((i) => isCurrentPage(i.productUrl));
              if (onThisPage) {
                void runAutoAddToCartWithRetry(6000);
              }

              // 2. Open any other store items with autoAddToCart enabled
              const otherUrls = figure.liked
                .filter((i) => !isCurrentPage(i.productUrl))
                .map((i) => i.productUrl)
                .filter(Boolean);

              if (otherUrls.length > 0) {
                void chrome.runtime.sendMessage({
                  type: 'fitmirror:open-tabs',
                  urls: otherUrls,
                  autoAddToCart: true,
                });
                infoMessage = `Added item to this bag & opened other stores to add to cart!`;
              } else {
                infoMessage = 'Added to your store bag!';
              }
              errorMessage = null;
              await render();
            })();
          });

          cartAllContainer.append(btnAllCart);
          card.append(cartAllContainer);
        }
      } else if (activeTab === 'looks') {
        // Cached Generated Looks History
        const looks = figure.lookHistory || [];
        if (looks.length === 0) {
          const hint = document.createElement('div');
          hint.className = 'empty-tab-hint';
          hint.textContent = 'Generated outfits will be cached here.';
          card.append(hint);
        } else {
          const list = document.createElement('div');
          list.className = 'clothes-list';

          for (const look of looks) {
            const row = document.createElement('div');
            row.className = 'clothing-item';

            // Generated avatar look thumbnail (clickable to inspect in lightbox!)
            const thumb = document.createElement('img');
            thumb.className = 'clothing-thumb';
            thumb.src = look.imageUrl;
            thumb.alt = look.garmentName;
            thumb.title = 'Click to inspect this generated look';
            thumb.style.cursor = 'zoom-in';
            thumb.style.borderRadius = '6px';
            thumb.addEventListener('click', (e) => {
              e.stopPropagation();
              openLightbox(look.imageUrl);
            });
            row.append(thumb);

            const meta = document.createElement('div');
            meta.className = 'clothing-meta';

            const site = document.createElement('div');
            site.className = 'clothing-site';
            site.textContent = look.retailer ? look.retailer : (look.category ? look.category.toUpperCase() : 'GENERATED LOOK');

            const nameLink = document.createElement('a');
            nameLink.className = 'clothing-name';
            nameLink.href = look.productUrl;
            nameLink.target = '_blank';
            nameLink.rel = 'noreferrer';
            nameLink.textContent = look.garmentName;
            nameLink.title = `${look.garmentName} — Click to visit store`;

            meta.append(site, nameLink);
            row.append(meta);

            const actions = document.createElement('div');
            actions.className = 'clothing-actions';

            const isActive = figure.avatarImageUrl === look.imageUrl;

            // Wear / Restore look button
            const btnWear = document.createElement('button');
            btnWear.type = 'button';
            btnWear.className = `action-btn ${isActive ? 'in-cart' : ''}`;
            btnWear.title = isActive ? 'Currently active look' : 'Wear / Restore this look on avatar';
            btnWear.innerHTML = isActive ? SVG_CART_ACTIVE : SVG_HANGER;
            btnWear.addEventListener('click', (e) => {
              e.stopPropagation();
              void (async () => {
                await restoreGeneratedLook(look.id);
                void render();
              })();
            });
            actions.append(btnWear);

            // Zoom / Inspect Button
            const btnZoom = document.createElement('button');
            btnZoom.type = 'button';
            btnZoom.className = 'action-btn';
            btnZoom.title = 'Inspect closer';
            btnZoom.innerHTML = SVG_ZOOM_IN;
            btnZoom.addEventListener('click', (e) => {
              e.stopPropagation();
              openLightbox(look.imageUrl);
            });
            actions.append(btnZoom);

            // Delete from cache button
            const btnDel = document.createElement('button');
            btnDel.type = 'button';
            btnDel.className = 'action-btn btn-remove';
            btnDel.title = 'Delete from cached looks';
            btnDel.innerHTML = SVG_REMOVE;
            btnDel.addEventListener('click', (e) => {
              e.stopPropagation();
              void (async () => {
                await deleteGeneratedLook(look.id);
                void render();
              })();
            });
            actions.append(btnDel);

            row.append(actions);
            list.append(row);
          }
          card.append(list);
        }
      } else {
        // Saved / Browsed products cache
        if (figure.browsedProducts.length === 0) {
          const hint = document.createElement('div');
          hint.className = 'empty-tab-hint';
          hint.textContent = 'Visited products will be cached here.';
          card.append(hint);
        } else {
          const list = document.createElement('div');
          list.className = 'clothes-list';

          for (const item of figure.browsedProducts) {
            const row = document.createElement('div');
            row.className = 'clothing-item';

            if (item.imageUrl) {
              const thumb = document.createElement('img');
              thumb.className = 'clothing-thumb';
              thumb.src = item.imageUrl;
              thumb.alt = item.name;
              row.append(thumb);
            }

            const meta = document.createElement('div');
            meta.className = 'clothing-meta';

            const site = document.createElement('div');
            site.className = 'clothing-site';
            site.textContent = cleanSiteName(item);

            const nameLink = document.createElement('a');
            nameLink.className = 'clothing-name';
            nameLink.href = item.productUrl;
            nameLink.target = '_blank';
            nameLink.rel = 'noreferrer';
            nameLink.textContent = item.name;
            nameLink.title = `${item.name} — Click to go back to product`;

            meta.append(site, nameLink);
            row.append(meta);

            const actions = document.createElement('div');
            actions.className = 'clothing-actions';

            // Try-on icon button
            if (item.imageUrl && figure.modelImage && !busy) {
              const btnTry = document.createElement('button');
              btnTry.type = 'button';
              btnTry.className = 'action-btn';
              btnTry.title = 'Try on this product';
              btnTry.innerHTML = SVG_HANGER;
              btnTry.addEventListener('click', (e) => {
                e.stopPropagation();
                void (async () => {
                  const fig = await loadFigure();
                  if (!fig.modelImage && !fig.avatarImageUrl) {
                    errorMessage = 'Please add your photo in the avatar first.';
                    void setAvatarMinimized(false);
                    void render();
                    return;
                  }
                  errorMessage = null;
                  busy = true;
                  await render();
                  try {
                    const res = await tryOnProduct(
                      item.imageUrl!,
                      item.productUrl,
                      item.name,
                      item.retailer,
                      item.category,
                      selectedFit,
                    );
                    if (!res.ok) {
                      errorMessage = res.error || 'Try-on failed.';
                    }
                  } catch (err: any) {
                    errorMessage = err?.message || 'Try-on failed. Please try again.';
                  } finally {
                    busy = false;
                    await render();
                    placeTryOnBadge();
                  }
                })();
              });
              actions.append(btnTry);
            }

            // Remove from saved history button
            const btnRemoveHist = document.createElement('button');
            btnRemoveHist.type = 'button';
            btnRemoveHist.className = 'action-btn btn-remove';
            btnRemoveHist.title = 'Remove from saved';
            btnRemoveHist.innerHTML = SVG_REMOVE;
            btnRemoveHist.addEventListener('click', (e) => {
              e.stopPropagation();
              void (async () => {
                await removeBrowsedProduct(item.id);
                await render();
              })();
            });
            actions.append(btnRemoveHist);

            row.append(actions);
            list.append(row);
          }
          card.append(list);
        }
      }
    }

    dock.append(card);
  }

  async function triggerTryOn() {
    const fig = await loadFigure();
    if (!fig.modelImage && !fig.avatarImageUrl) {
      errorMessage = 'Please add your photo in the avatar first.';
      void setAvatarMinimized(false);
      void render();
      return;
    }
    errorMessage = null;
    busy = true;
    await render();
    try {
      const product = extractProductFromPage();
      const activeCategory = currentCategoryOverride ?? product.category;
      console.log('[FitMirror] Initiating try-on on current page:', product.name, activeCategory, selectedFit);
      const res = await tryOnThisPage(activeCategory, selectedFit);
      console.log('[FitMirror] Try-on response:', res);
      if (!res.ok) {
        errorMessage = res.error || 'Try-on failed.';
      }
    } catch (err: any) {
      console.error('[FitMirror] Try-on error:', err);
      errorMessage = err?.message || 'Try-on failed. Please try again.';
    } finally {
      busy = false;
      await render();
      placeTryOnBadge();
    }
  }

  async function placeTryOnBadge() {
    document.getElementById('fitmirror-tryon-badge')?.remove();
    const product = extractProductFromPage();
    if (!product.imageUrl) return;
    const img = [...document.images].find((el) => {
      const src = el.currentSrc || el.src;
      if (!src || src.startsWith('data:')) return false;
      return (
        src === product.imageUrl ||
        src.includes(product.imageUrl!) ||
        product.imageUrl!.includes(src)
      );
    });
    if (!img) return;

    const figure = await loadFigure();
    const currentWorn = figure.liked.find(
      (item) =>
        (product.sourceUrl && item.productUrl === product.sourceUrl) ||
        (product.name && item.name.toLowerCase() === product.name.toLowerCase()),
    );

    const activeCategory = currentCategoryOverride ?? product.category;
    const catLabel = formatCategoryLabel(activeCategory, product.name);

    const badge = document.createElement('button');
    badge.id = 'fitmirror-tryon-badge';
    badge.type = 'button';
    if (currentWorn) {
      badge.innerHTML = `${SVG_REMOVE} Remove`;
      badge.title = 'Remove this garment from your avatar';
    } else {
      badge.innerHTML = `${SVG_HANGER} Try on ${catLabel}`;
      badge.title = `Try on ${product.name} as ${catLabel}`;
    }

    badge.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      currentWorn
        ? 'border:1px solid rgba(239, 68, 68, 0.4)'
        : 'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:999px',
      'padding:6px 12px',
      'font:600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      currentWorn ? 'background:rgba(220, 38, 38, 0.92)' : 'background:rgba(15, 23, 42, 0.92)',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'color:#ffffff',
      'cursor:pointer',
      'box-shadow:0 8px 20px rgba(0,0,0,0.25)',
      'display:flex',
      'align-items:center',
      'gap:5px',
      'transition:transform 0.15s, opacity 0.15s',
    ].join(';');

    const move = () => {
      const rect = img.getBoundingClientRect();
      if (rect.width < 40 || rect.bottom < 0 || rect.top > window.innerHeight) {
        badge.style.display = 'none';
        return;
      }
      badge.style.display = 'flex';
      badge.style.top = `${Math.max(10, rect.top + 10)}px`;
      badge.style.left = `${Math.max(10, rect.left + 10)}px`;
    };
    move();

    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'scale(1.05)';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'scale(1)';
    });

    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      if (currentWorn) {
        void (async () => {
          await removeGarment(currentWorn.id);
          await render();
          placeTryOnBadge();
        })();
      } else {
        void triggerTryOn();
      }
    });

    window.addEventListener('scroll', move, { passive: true });
    window.addEventListener('resize', move);
    document.documentElement.append(badge);
  }

  // Handle auto-add-to-cart flag when opened from "Put all into cart" or via storage coordination
  async function checkPendingAutoCart() {
    const isHash = location.hash.includes('fitmirror_cart') || location.search.includes('fitmirror_cart');
    if (isHash) {
      try {
        history.replaceState(null, '', location.href.replace(/[#&?]fitmirror_cart=1/, ''));
      } catch {}
    }
    const isStorage = await consumePendingCartAdd(location.href);

    if (isHash || isStorage) {
      const res = await runAutoAddToCartWithRetry(10000);
      if (res.success) {
        infoMessage = 'Automatically added to this store bag!';
      } else {
        errorMessage = res.message;
      }
      void render();
    }
  }

  void checkPendingAutoCart();

  chrome.storage.onChanged.addListener(() => {
    void render();
    void placeTryOnBadge();
  });

  // Keep avatar synced across tabs when switching tabs or focusing window
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void render();
      void placeTryOnBadge();
    }
  });

  window.addEventListener('focus', () => {
    void render();
    void placeTryOnBadge();
  });

  window.addEventListener('popstate', () => {
    void render();
    void placeTryOnBadge();
  });

  void render();
  void placeTryOnBadge();
  window.setTimeout(() => void placeTryOnBadge(), 1500);
}

ensureAvatar();
