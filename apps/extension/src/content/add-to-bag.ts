// Adds the current product to the store's real bag/cart.
//
// Every click is verified: we only report success when the page shows it
// (bag count goes up, a mini-bag opens, "added to bag" text appears, or the
// page moves to the bag). Order of attempts:
//   1. the button that worked here before, or the hardcoded selectors
//   2. Gemini, given a screenshot plus the page's visible controls, told what
//      already failed. It can also pick a size and close a blocking pop-up.
// Clicks go through the debugger API so the page sees a real (isTrusted) click.

import { extractProductFromPage } from '../lib/extract-product';

export type ToastFn = (text: string, duration?: number, isSuccess?: boolean) => void;
export type AddToBagResult = { success: boolean; message: string };

type Verdict = 'added' | 'needs-size' | 'unknown';

const OWN_UI_IDS = ['fitmirror-avatar-root', 'fitmirror-tryon-badge', 'fitmirror-toast-notification'];
const OWN_UI = OWN_UI_IDS.map((id) => `#${id}`).join(', ');
const LABELS_KEY = 'fitmirror_cart_labels';
const MAX_CANDIDATES = 300;

const SUCCESS_TEXT =
  /added to (your )?(shopping )?(bag|cart|basket)|item(s)? added|has been added|successfully added|in your (bag|cart|basket)|view (bag|cart|basket)|go to (bag|cart|basket)|warenkorb hinzugefügt|ajouté au panier/i;
const SIZE_ERROR_TEXT =
  /(please )?(select|choose|pick) (a |your )?size|size is required|select an option|choose an option|bitte (eine )?größe/i;
const NOT_CART_ACTION =
  /wish|favou?rite|save for later|saved|heart|share|notify|size guide|find in store/i;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- DOM helpers

function isOwnUi(el: Element): boolean {
  return Boolean(el.closest(OWN_UI));
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function isDisabled(el: HTMLElement): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    /\b(disabled|out-of-stock|unavailable|sold-?out)\b/i.test(el.className?.toString() ?? '')
  );
}

function isSelected(el: HTMLElement): boolean {
  if (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true') return true;
  if (el.getAttribute('aria-pressed') === 'true') return true;
  if (/\b(active|selected|is-selected|is-active)\b/i.test(el.className?.toString() ?? '')) return true;
  const input = el.tagName === 'LABEL' ? (el as HTMLLabelElement).control : null;
  if (input instanceof HTMLInputElement && input.checked) return true;
  const prev = el.previousElementSibling;
  return prev instanceof HTMLInputElement && prev.type === 'radio' && prev.checked;
}

function textOf(el: HTMLElement): string {
  return clip(el.innerText || el.textContent || (el as HTMLInputElement).value, 120);
}

function clip(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isNotCartAction(el: HTMLElement): boolean {
  const haystack = [
    el.innerText || el.textContent || '',
    el.getAttribute('aria-label') || '',
    el.getAttribute('title') || '',
    el.id,
    el.className?.toString() || '',
  ].join(' ');
  return NOT_CART_ACTION.test(haystack);
}

/** Hide our own avatar/badge so it neither covers the store's button nor shows in screenshots. */
async function withOwnUiHidden<T>(fn: () => Promise<T>): Promise<T> {
  const hidden: Array<[HTMLElement, string]> = [];
  for (const id of OWN_UI_IDS) {
    const el = document.getElementById(id);
    if (el) {
      hidden.push([el, el.style.visibility]);
      el.style.visibility = 'hidden';
    }
  }
  try {
    return await fn();
  } finally {
    for (const [el, prev] of hidden) el.style.visibility = prev;
  }
}

// ---------------------------------------------------------------- clicking

function syntheticClick(el: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  // click() on a submit button submits its form itself; submitting again double-adds.
  el.click();
}

/** A real mouse click at the element's centre, or a synthetic one if that is not possible. */
async function realClick(el: HTMLElement): Promise<void> {
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  await sleep(250);
  await withOwnUiHidden(async () => {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const reachable = hit && (hit === el || el.contains(hit) || hit.contains(el));
    if (reachable) {
      try {
        const res = (await chrome.runtime.sendMessage({ type: 'fitmirror:trusted-click', x, y })) as
          | { ok?: boolean }
          | undefined;
        if (res?.ok) return;
      } catch {
        // fall through to a synthetic click
      }
    }
    syntheticClick(el);
  });
}

function chooseInSelect(select: HTMLSelectElement): boolean {
  for (const opt of Array.from(select.options)) {
    if (opt.value && !opt.disabled && !/select|choose/i.test(opt.text)) {
      select.value = opt.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

async function pickSize(el: HTMLElement) {
  if (el instanceof HTMLSelectElement) chooseInSelect(el);
  else await realClick(el);
  await sleep(600);
}

// ---------------------------------------------------------------- verification

const COUNT_SELECTOR = [
  'a[href*="cart" i]',
  'a[href*="bag" i]',
  'a[href*="basket" i]',
  '[class*="cart-count" i]',
  '[class*="cart-qty" i]',
  '[class*="cart-quantity" i]',
  '[class*="minicart-quantity" i]',
  '[class*="bag-count" i]',
  '[class*="basket-count" i]',
  '[data-testid*="cart" i]',
  '[data-testid*="bag" i]',
  '[aria-label*="cart" i]',
  '[aria-label*="bag" i]',
].join(', ');

/** Sum of the little numbers next to the bag/cart icons. */
function cartCountTotal(): number {
  let total = 0;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(COUNT_SELECTOR))) {
    if (isOwnUi(el)) continue;
    const text = (el.innerText || el.textContent || '').trim();
    // Product links like /handbags/... carry unrelated numbers; the bag icon lives up top or is just a count.
    if (!el.closest('header, nav, [class*="header" i]') && text.length > 12) continue;
    const source = `${text} ${el.getAttribute('aria-label') || ''}`;
    const match = source.match(/\b(\d{1,2})\b/);
    if (match) total += Number(match[1]);
  }
  return total;
}

const PANEL_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  'dialog[open]',
  '[class*="minicart" i]',
  '[class*="mini-cart" i]',
  '[class*="cart-drawer" i]',
  '[class*="cartdrawer" i]',
  '[class*="bag-drawer" i]',
  '[class*="added-to" i]',
  '[class*="add-to-cart-modal" i]',
  '[class*="addtocart" i]',
  '[id*="minicart" i]',
  '[id*="cart-drawer" i]',
  '[id*="cart-notification" i]',
  '[class*="cart-notification" i]',
].join(', ');

function visiblePanels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(PANEL_SELECTOR)).filter(
    (el) => !isOwnUi(el) && isVisible(el),
  );
}

function visibleErrors(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="alert"], [aria-live], [class*="error" i], [class*="invalid" i], [class*="warning" i]',
    ),
  ).filter((el) => !isOwnUi(el) && isVisible(el) && SIZE_ERROR_TEXT.test(el.innerText || ''));
}

/** Run `action`, then watch the page for proof that something landed in the bag. */
async function clickAndVerify(el: HTMLElement, timeoutMs = 4500): Promise<Verdict> {
  const beforeCount = cartCountTotal();
  const beforePanels = new Set(visiblePanels());
  const beforeErrors = new Set(visibleErrors());
  const beforeUrl = location.href;
  let addedText = '';
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && isOwnUi(node)) continue;
        const text = node instanceof HTMLElement ? node.innerText : node.textContent;
        if (text) addedText += ` ${text.slice(0, 500)}`;
      }
    }
    if (addedText.length > 20_000) addedText = addedText.slice(-10_000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  try {
    await realClick(el);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await sleep(250);
      if (location.href !== beforeUrl && /(cart|bag|basket)/i.test(location.pathname)) return 'added';
      if (cartCountTotal() > beforeCount) return 'added';
      if (SUCCESS_TEXT.test(addedText)) return 'added';
      const panel = visiblePanels().find((p) => !beforePanels.has(p));
      if (panel) {
        const panelText = panel.innerText || '';
        if (SIZE_ERROR_TEXT.test(panelText)) return 'needs-size';
        const ident = `${panel.id} ${panel.className?.toString() ?? ''}`;
        if (/cart|bag|basket/i.test(ident) || SUCCESS_TEXT.test(panelText) || /checkout/i.test(panelText)) {
          return 'added';
        }
      }
      if (SIZE_ERROR_TEXT.test(addedText)) return 'needs-size';
      if (visibleErrors().some((e) => !beforeErrors.has(e))) return 'needs-size';
    }
    return 'unknown';
  } finally {
    observer.disconnect();
  }
}

// ---------------------------------------------------------------- selector heuristics

const ADD_SELECTORS = [
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

const ADD_TEXT =
  /^(add to (shopping )?(bag|cart|basket)|add|añadir a la cesta|ajouter au panier|in den warenkorb|加入购物车|ใส่ตะกร้า)$/i;

function findAddButton(): { btn: HTMLElement | null; disabledBtn: HTMLElement | null } {
  let disabledBtn: HTMLElement | null = null;
  const consider = (el: HTMLElement): HTMLElement | null => {
    if (isOwnUi(el) || isNotCartAction(el) || !isVisible(el)) return null;
    if (isDisabled(el)) {
      disabledBtn = disabledBtn || el;
      return null;
    }
    return el;
  };

  for (const sel of ADD_SELECTORS) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const ok = consider(el);
      if (ok) return { btn: ok, disabledBtn };
    }
  }
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>('button, a, input[type="submit"], [role="button"]'),
  )) {
    const text = textOf(el);
    if (ADD_TEXT.test(text) || (/add to (shopping )?(bag|cart|basket)/i.test(text) && text.length < 35)) {
      const ok = consider(el);
      if (ok) return { btn: ok, disabledBtn };
    }
  }
  return { btn: null, disabledBtn };
}

const SIZE_OPTION_SELECTORS = [
  'button[data-qa-action*="size"]',
  '.size-selector button',
  '.size-selector a',
  '[data-testid*="size"] button',
  '[data-test*="size"] button',
  'ul.sizes li button',
  '.swatches--size button',
  '.swatches.size button',
  '.swatches.size a',
  '[class*="size-picker" i] button',
  '[class*="size-selector" i] button',
  '[class*="size-attribute" i] button',
  '[class*="size-list" i] button',
  '[data-attr="size"] button',
  '[data-attr="size"] a',
  '[data-attr="size"] [role="radio"]',
  'input[type="radio"][name*="size" i] + label',
  '.product-form__input--pill input + label',
].join(', ');

/** The first in-stock size, but only if the page has sizes and none is picked yet. */
function findSizeToPick(): HTMLElement | null {
  for (const sel of Array.from(
    document.querySelectorAll<HTMLSelectElement>(
      'select[name*="size" i], select[id*="size" i], select[data-testid*="size" i], select[aria-label*="size" i]',
    ),
  )) {
    if (!isVisible(sel)) continue;
    const current = sel.options[sel.selectedIndex];
    if (!current || !current.value || /select|choose/i.test(current.text)) return sel;
  }

  const options = Array.from(document.querySelectorAll<HTMLElement>(SIZE_OPTION_SELECTORS)).filter(
    (el) => !isOwnUi(el) && isVisible(el),
  );
  if (options.length === 0 || options.some(isSelected)) return null;
  return options.find((el) => !isDisabled(el)) ?? null;
}

// ---------------------------------------------------------------- learned wording

async function loadLabels(): Promise<Record<string, string>> {
  try {
    const store = await chrome.storage.local.get(LABELS_KEY);
    const value = store[LABELS_KEY];
    return value && typeof value === 'object' ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function saveLabel(host: string, text: string | null) {
  try {
    const labels = await loadLabels();
    if (text ? labels[host] === text : !(host in labels)) return;
    if (text) labels[host] = text;
    else delete labels[host];
    await chrome.storage.local.set({ [LABELS_KEY]: labels });
  } catch {
    // not worth failing the add over
  }
}

function findByText(text: string): HTMLElement | null {
  const want = text.toLowerCase();
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>('button, a, input[type="submit"], [role="button"]'),
  )) {
    if (isOwnUi(el) || !isVisible(el) || isDisabled(el)) continue;
    if (textOf(el).toLowerCase() === want) return el;
  }
  return null;
}

// ---------------------------------------------------------------- Gemini

type Candidate = {
  i: number;
  tag: string;
  text: string;
  label?: string;
  attrs?: string;
  rect: [number, number, number, number];
  inView: boolean;
  disabled?: boolean;
  selected?: boolean;
  clicked?: boolean;
};

type GeminiPick = {
  ok: boolean;
  addToCart?: number | null;
  addToCartText?: string | null;
  size?: number | null;
  dismiss?: number | null;
  error?: string;
};

const CANDIDATE_SELECTOR = [
  'button',
  'a[href]',
  'input[type="submit"]',
  'input[type="button"]',
  '[role="button"]',
  '[role="radio"]',
  '[role="option"]',
  'label',
  'select',
].join(', ');

function describeAttrs(el: HTMLElement): string {
  const parts: string[] = [];
  for (const name of ['id', 'name', 'type', 'data-testid', 'data-test', 'data-qa-action', 'class']) {
    const value = el.getAttribute(name);
    if (value) parts.push(`${name}=${clip(value, 60)}`);
  }
  return clip(parts.join(' '), 200);
}

/** Icon-only buttons: fall back to the SVG's <title> or sprite id. */
function iconLabel(el: HTMLElement): string {
  const title = el.querySelector('svg title')?.textContent;
  if (title) return title;
  const use = el.querySelector('svg use');
  const href = use?.getAttribute('href') || use?.getAttribute('xlink:href');
  return href ? `icon:${href.split('#').pop()}` : '';
}

function collectCandidates(clicked: Set<HTMLElement>): { elements: HTMLElement[]; candidates: Candidate[] } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const all = Array.from(document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR)).filter(
    // Site header/footer/nav hold the "view bag" icon and menus, never the add button.
    (el) => !isOwnUi(el) && !el.closest('header, footer, nav') && isVisible(el),
  );
  const inView = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  };
  // What's on screen first, so the cap never drops the button you can see.
  const ordered = [...all.filter(inView), ...all.filter((el) => !inView(el))];

  const elements: HTMLElement[] = [];
  const candidates: Candidate[] = [];
  for (const el of ordered) {
    if (elements.length >= MAX_CANDIDATES) break;
    const text =
      el instanceof HTMLSelectElement
        ? clip(Array.from(el.options).map((o) => o.text).join(' | '), 120)
        : textOf(el);
    const label = clip(el.getAttribute('aria-label') || el.getAttribute('title') || iconLabel(el), 120);
    const attrs = describeAttrs(el);
    if (!text && !label && !attrs) continue;
    const r = el.getBoundingClientRect();
    const i = elements.length;
    elements.push(el);
    candidates.push({
      i,
      tag: el.tagName.toLowerCase(),
      text,
      ...(label ? { label } : {}),
      ...(attrs ? { attrs } : {}),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      inView: inView(el),
      ...(isDisabled(el) ? { disabled: true } : {}),
      ...(isSelected(el) ? { selected: true } : {}),
      ...(clicked.has(el) ? { clicked: true } : {}),
    });
  }
  return { elements, candidates };
}

/** Viewport screenshot scaled to CSS pixels so it lines up with each candidate's rect. */
async function captureViewport(): Promise<string | null> {
  try {
    const res = (await withOwnUiHidden(async () => {
      await sleep(60);
      return chrome.runtime.sendMessage({ type: 'fitmirror:capture-tab' });
    })) as { ok?: boolean; dataUrl?: string } | undefined;
    if (!res?.ok || !res.dataUrl) return null;
    const img = new Image();
    img.src = res.dataUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

async function askGemini(
  clicked: Set<HTMLElement>,
  note: string,
): Promise<{ pick: GeminiPick; elements: HTMLElement[] }> {
  const screenshot = await captureViewport();
  const { elements, candidates } = collectCandidates(clicked);
  if (candidates.length === 0) {
    return { pick: { ok: false, error: 'No buttons on this page.' }, elements };
  }
  const pick = (await chrome.runtime.sendMessage({
    type: 'fitmirror:locate-cart',
    payload: {
      url: location.href,
      productName: extractProductFromPage().name,
      candidates,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      ...(screenshot ? { screenshot } : {}),
      ...(note ? { note } : {}),
    },
  })) as GeminiPick | undefined;
  return { pick: pick ?? { ok: false, error: 'Gemini lookup failed.' }, elements };
}

// ---------------------------------------------------------------- orchestration

let running = false;

export async function addToBag(toast: ToastFn, maxWaitMs = 25_000): Promise<AddToBagResult> {
  if (running) return { success: false, message: 'Already adding to your bag...' };
  running = true;
  try {
    return await run(toast, Date.now() + maxWaitMs);
  } finally {
    running = false;
  }
}

async function run(toast: ToastFn, deadline: number): Promise<AddToBagResult> {
  toast('FitMirror: Adding to your bag...', 3500);
  const host = location.hostname.replace(/^www\./, '');
  const clicked = new Set<HTMLElement>();
  let clickedUnconfirmed: string | null = null;
  let note = '';

  const tryClick = async (el: HTMLElement): Promise<Verdict> => {
    clicked.add(el);
    const label = textOf(el) || clip(el.getAttribute('aria-label'), 60) || 'the add button';
    const verdict = await clickAndVerify(el);
    console.info('[FitMirror cart] clicked', JSON.stringify(label), '->', verdict, el);
    if (verdict === 'added') {
      await saveLabel(host, textOf(el) || null);
      return verdict;
    }
    clickedUnconfirmed = label;
    note =
      verdict === 'needs-size'
        ? `Clicking "${label}" made the page ask for a size. Pick a size first.`
        : `Clicking "${label}" did not add anything to the bag (no bag count change, no mini-bag). Find the real add-to-bag control, or a size that must be picked first.`;
    return verdict;
  };

  const success = (el: HTMLElement | null): AddToBagResult => {
    const label = (el && textOf(el)) || 'Add to bag';
    toast(`✓ Added to your bag ("${label}")`, 4500, true);
    return { success: true, message: 'Added to your store bag!' };
  };

  // 1. The page may still be rendering: wait briefly for a known button.
  let found = findAddButton();
  const settleUntil = Math.min(deadline, Date.now() + 3000);
  while (!found.btn && !found.disabledBtn && Date.now() < settleUntil) {
    await sleep(300);
    found = findAddButton();
  }

  // 2. The wording that worked on this store before, else the selectors.
  const learned = (await loadLabels())[host];
  let first = (learned && findByText(learned)) || found.btn;
  if (!first && found.disabledBtn) {
    // Button stays disabled until a size is chosen.
    const size = findSizeToPick();
    if (size) await pickSize(size);
    first = findAddButton().btn;
  }
  if (first) {
    const size = findSizeToPick();
    if (size) await pickSize(size);
    let verdict = await tryClick(first);
    if (verdict === 'needs-size') {
      const retrySize = findSizeToPick();
      if (retrySize) {
        await pickSize(retrySize);
        verdict = await tryClick(first);
      }
    }
    if (verdict === 'added') return success(first);
    if (learned) await saveLabel(host, null);
  }

  // 3. Ask Gemini (with a screenshot), at most twice.
  let lastError = '';
  for (let round = 0; round < 2 && Date.now() < deadline; round++) {
    toast('FitMirror: Reading the page to find the add button...', 4000);
    const { pick, elements } = await askGemini(clicked, note);
    console.info('[FitMirror cart] Gemini pick', pick);
    if (!pick.ok) {
      lastError = pick.error || 'Gemini lookup failed.';
      break;
    }

    const dismissEl = pick.dismiss != null ? elements[pick.dismiss] : undefined;
    if (dismissEl) {
      await realClick(dismissEl);
      await sleep(500);
    }
    const sizeEl = pick.size != null ? elements[pick.size] : undefined;
    if (sizeEl) await pickSize(sizeEl);

    const cartEl = pick.addToCart != null ? elements[pick.addToCart] : undefined;
    if (!cartEl || !cartEl.isConnected) {
      lastError = 'Gemini could not find an add-to-bag button.';
      if (dismissEl || sizeEl) continue;
      break;
    }
    // Re-clicking the same button without a new size or closed pop-up risks a double add.
    if (clicked.has(cartEl) && !sizeEl && !dismissEl) {
      lastError = 'Gemini picked the button that already failed.';
      break;
    }
    if ((await tryClick(cartEl)) === 'added') return success(cartEl);
  }

  if (clickedUnconfirmed) {
    toast(`FitMirror: Clicked "${clickedUnconfirmed}" — check your bag`, 6000);
    return {
      success: false,
      message: `Clicked "${clickedUnconfirmed}" but the page didn't confirm it was added. Check your bag, or pick a size and try again.`,
    };
  }
  if (found.disabledBtn) {
    found.disabledBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('FitMirror: Please select your size to finish adding to bag', 6000);
    return { success: false, message: 'Please select your size on the store page, then try again.' };
  }
  toast('FitMirror: Could not find the add-to-bag button', 5000);
  return {
    success: false,
    message: lastError || 'Could not find the add-to-bag button on this page.',
  };
}
