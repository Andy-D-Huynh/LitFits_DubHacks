// Fallback for stores the hardcoded selectors miss: send the page's visible
// controls to Gemini (via the server) and click what it picks. The exact
// button wording it finds is remembered per store, so repeat adds skip the call.

const OWN_UI = '#fitmirror-avatar-root, #fitmirror-tryon-badge, #fitmirror-toast-notification';
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
const MAX_CANDIDATES = 300;
const LABELS_KEY = 'fitmirror_cart_labels';

type Candidate = {
  i: number;
  tag: string;
  text: string;
  label?: string;
  attrs?: string;
  disabled?: boolean;
  selected?: boolean;
};

type LocateResponse = {
  ok: boolean;
  addToCart?: number | null;
  addToCartText?: string | null;
  size?: number | null;
  error?: string;
};

function clip(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
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
    el.getAttribute('aria-disabled') === 'true' ||
    /\b(disabled|out-of-stock|unavailable|sold-?out)\b/i.test(el.className?.toString() ?? '')
  );
}

function isSelected(el: HTMLElement): boolean {
  if (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true') return true;
  if (/\b(active|selected|is-selected)\b/i.test(el.className?.toString() ?? '')) return true;
  const input = el.tagName === 'LABEL' ? (el as HTMLLabelElement).control : null;
  return input instanceof HTMLInputElement && input.checked;
}

function describeAttrs(el: HTMLElement): string {
  const parts: string[] = [];
  for (const name of ['id', 'name', 'type', 'data-testid', 'data-test', 'data-qa-action', 'class']) {
    const value = el.getAttribute(name);
    if (value) parts.push(`${name}=${clip(value, 60)}`);
  }
  return clip(parts.join(' '), 200);
}

function collectCandidates(): { elements: HTMLElement[]; candidates: Candidate[] } {
  const elements: HTMLElement[] = [];
  const candidates: Candidate[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR))) {
    if (elements.length >= MAX_CANDIDATES) break;
    if (el.closest(OWN_UI)) continue;
    // Site header/footer/nav links are the "view cart" icon, menus, etc. — never the target.
    if (el.closest('header, footer, nav')) continue;
    if (!isVisible(el)) continue;

    const text =
      el instanceof HTMLSelectElement
        ? clip(Array.from(el.options).map((o) => o.text).join(' | '), 120)
        : clip(el.innerText || el.textContent || (el as HTMLInputElement).value, 120);
    const label = clip(el.getAttribute('aria-label') || el.getAttribute('title'), 120);
    if (!text && !label) continue;

    const i = elements.length;
    elements.push(el);
    candidates.push({
      i,
      tag: el.tagName.toLowerCase(),
      text,
      ...(label ? { label } : {}),
      ...(describeAttrs(el) ? { attrs: describeAttrs(el) } : {}),
      ...(isDisabled(el) ? { disabled: true } : {}),
      ...(isSelected(el) ? { selected: true } : {}),
    });
  }
  return { elements, candidates };
}

async function loadLabels(): Promise<Record<string, string>> {
  try {
    const store = await chrome.storage.local.get(LABELS_KEY);
    const value = store[LABELS_KEY];
    return value && typeof value === 'object' ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function rememberLabel(host: string, text: string) {
  try {
    const labels = await loadLabels();
    if (labels[host] === text) return;
    await chrome.storage.local.set({ [LABELS_KEY]: { ...labels, [host]: text } });
  } catch {}
}

async function forgetLabel(host: string) {
  try {
    const labels = await loadLabels();
    if (!(host in labels)) return;
    delete labels[host];
    await chrome.storage.local.set({ [LABELS_KEY]: labels });
  } catch {}
}

function selectFirstOption(select: HTMLSelectElement) {
  for (const opt of Array.from(select.options)) {
    if (opt.value && !opt.disabled && !/select|choose/i.test(opt.text)) {
      select.selectedIndex = opt.index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
}

/**
 * Find and click the store's add-to-cart button with Gemini's help.
 * `click` is the same event sequence the selector path uses.
 */
export async function aiAddToCart(
  productName: string,
  click: (el: HTMLElement) => void,
): Promise<{ clicked: boolean; text?: string; error?: string }> {
  const host = location.hostname.replace(/^www\./, '');

  // 1. Wording learned on an earlier visit to this store.
  const known = (await loadLabels())[host];
  if (known) {
    const { elements, candidates } = collectCandidates();
    const match = candidates.find(
      (c) => !c.disabled && c.text.toLowerCase() === known.toLowerCase(),
    );
    const el = match && elements[match.i];
    if (match && el) {
      click(el);
      return { clicked: true, text: match.text };
    }
  }

  // 2. Ask Gemini.
  const { elements, candidates } = collectCandidates();
  if (candidates.length === 0) return { clicked: false, error: 'No buttons on this page.' };

  const response = (await chrome.runtime.sendMessage({
    type: 'fitmirror:locate-cart',
    payload: { url: location.href, productName, candidates },
  })) as LocateResponse | undefined;
  if (!response?.ok) return { clicked: false, error: response?.error || 'Gemini lookup failed.' };

  if (response.size != null) {
    const sizeEl = elements[response.size];
    if (sizeEl instanceof HTMLSelectElement) selectFirstOption(sizeEl);
    else if (sizeEl) click(sizeEl);
    await new Promise((r) => setTimeout(r, 500));
  }

  if (response.addToCart == null) {
    await forgetLabel(host);
    return { clicked: false, error: 'Gemini could not find an add-to-cart button.' };
  }
  const cartEl = elements[response.addToCart];
  if (!cartEl || !cartEl.isConnected) {
    return { clicked: false, error: 'The add-to-cart button disappeared before it could be clicked.' };
  }
  click(cartEl);
  const text = response.addToCartText || clip(cartEl.innerText, 120);
  if (text) await rememberLabel(host, text);
  return { clicked: true, text };
}
