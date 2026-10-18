import { cleanSizeLabel, resolveSizeList, sizesFromJsonLd } from '@fitmirror/shared';

const SIZE_SELECT_SELECTOR = [
  'select[name*="size" i]',
  'select[id*="size" i]',
  'select[aria-label*="size" i]',
  'select[data-testid*="size" i]',
  'select[data-test*="size" i]',
  'select[class*="size" i]',
].join(', ');

const SIZE_OPTION_SELECTOR = [
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
].join(', ');

export type PageSizeList = {
  sizes: string[];
  selected: string | null;
};

type SizeHit = {
  label: string;
  selected: boolean;
  activate: () => void;
};

function classText(el: Element): string {
  return typeof el.className === 'string' ? el.className : '';
}

function ownedByUs(el: Element): boolean {
  return Boolean(el.closest('#fitmirror-avatar-root, #fitmirror-tryon-badge'));
}

function isInSizeGuide(el: Element): boolean {
  return Boolean(
    el.closest(
      '[class*="size-guide" i], [class*="size-chart" i], [id*="size-guide" i], [id*="size-chart" i], [data-testid*="size-guide" i], [data-testid*="size-chart" i]',
    ),
  );
}

function isSizeGuideControl(el: Element): boolean {
  const name = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('name') || ''} ${classText(el)}`;
  return /guide|chart/i.test(name);
}

function isSelected(el: HTMLElement): boolean {
  if (el.getAttribute('aria-checked') === 'true') return true;
  if (el.getAttribute('aria-pressed') === 'true') return true;
  if (el.getAttribute('aria-selected') === 'true') return true;
  if (el instanceof HTMLInputElement && el.checked) return true;
  const nested = el.querySelector('input');
  if (nested instanceof HTMLInputElement && nested.checked) return true;
  for (const token of classText(el).split(/\s+/)) {
    if (/^(?:is-)?(?:selected|active)$/.test(token)) return true;
    if (/(?:--|-)(?:selected|active)$/.test(token)) return true;
  }
  return false;
}

function groupLooksLikeSize(el: Element): boolean {
  const name = `${el.getAttribute('aria-label') || ''} ${el.querySelector('legend')?.textContent || ''}`
    .replace(/\s+/g, ' ')
    .trim();
  return /^size\b/i.test(name) && !/guide|chart/i.test(name) && name.length < 40;
}

function collectHits(root: ParentNode): SizeHit[] {
  const hits: SizeHit[] = [];

  const push = (label: string | null | undefined, selected: boolean, activate: () => void) => {
    const text = label?.replace(/\s+/g, ' ').trim();
    if (!text) return;
    hits.push({ label: text, selected, activate });
  };

  for (const sel of root.querySelectorAll<HTMLSelectElement>(SIZE_SELECT_SELECTOR)) {
    if (ownedByUs(sel) || isInSizeGuide(sel) || isSizeGuideControl(sel)) continue;
    const meaningful = [...sel.options].some((opt) =>
      cleanSizeLabel(opt.textContent || opt.label || '', true),
    );
    if (!meaningful) continue;
    for (const opt of sel.options) {
      push(opt.textContent || opt.label, opt.selected, () => {
        if (sel.value === opt.value) return;
        sel.value = opt.value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  }

  for (const el of root.querySelectorAll<HTMLElement>(SIZE_OPTION_SELECTOR)) {
    if (ownedByUs(el) || isInSizeGuide(el) || el.closest('select')) continue;
    const raw = el.getAttribute('data-size') || el.getAttribute('aria-label') || el.textContent;
    push(raw, isSelected(el), () => el.click());
  }

  for (const input of root.querySelectorAll<HTMLInputElement>('input[type="radio"][name*="size" i]')) {
    if (ownedByUs(input) || isInSizeGuide(input)) continue;
    const label = input.labels?.[0];
    const raw = label?.textContent || input.getAttribute('aria-label') || input.value;
    push(raw, input.checked, () => input.click());
  }

  for (const group of root.querySelectorAll<HTMLElement>('fieldset, [role="radiogroup"], [role="listbox"]')) {
    if (ownedByUs(group) || isInSizeGuide(group) || !groupLooksLikeSize(group)) continue;
    for (const el of group.querySelectorAll<HTMLElement>('button, label, [role="radio"], [role="option"]')) {
      if (el.closest('select')) continue;
      const raw = el.getAttribute('data-size') || el.getAttribute('aria-label') || el.textContent;
      push(raw, isSelected(el), () => el.click());
    }
  }

  return hits;
}

function fromUnlabeledSelects(root: ParentNode): PageSizeList | null {
  let best: PageSizeList | null = null;
  for (const sel of root.querySelectorAll<HTMLSelectElement>('select')) {
    if (ownedByUs(sel) || isInSizeGuide(sel)) continue;
    const resolved = resolveSizeList(
      [...sel.options].map((opt) => ({
        label: opt.textContent || opt.label || '',
        selected: opt.selected,
      })),
    );
    const usable = resolved.sizes.filter((size) => /[a-z]/i.test(size) || Number(size) >= 24);
    if (usable.length < 2 || usable.length !== resolved.sizes.length) continue;
    if (!best || resolved.sizes.length > best.sizes.length) best = resolved;
  }
  return best;
}

/** Sizes the product page is offering, and the one it currently has selected. */
export function readPageSizes(root: ParentNode = document): PageSizeList {
  const hits = collectHits(root);
  let resolved = resolveSizeList(hits.map((hit) => ({ label: hit.label, selected: hit.selected })));

  if (resolved.sizes.length < 2 && 'querySelectorAll' in root) {
    const texts: string[] = [];
    for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
      const text = script.textContent?.trim();
      if (text) texts.push(text);
    }
    const fromLd = sizesFromJsonLd(texts);
    if (fromLd.length > resolved.sizes.length) {
      const selected =
        resolved.selected && fromLd.some((size) => size.toLowerCase() === resolved.selected?.toLowerCase())
          ? resolved.selected
          : null;
      resolved = { sizes: fromLd, selected };
    }
  }

  if (resolved.sizes.length === 0) {
    return fromUnlabeledSelects(root) ?? resolved;
  }
  return resolved;
}

/** Select the same size on the product page, when a matching control exists. */
export function selectPageSize(label: string, root: ParentNode = document): boolean {
  const want = cleanSizeLabel(label, true)?.toLowerCase();
  if (!want) return false;
  const hit = collectHits(root).find((entry) => cleanSizeLabel(entry.label, true)?.toLowerCase() === want);
  if (!hit) return false;
  hit.activate();
  return true;
}
