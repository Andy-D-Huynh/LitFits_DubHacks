import { STORAGE_KEY } from '../lib/types';

/** Keep Studio localStorage ↔ chrome.storage in sync on localhost. */
export function maybeSyncStudio() {
  const host = location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return;

  let applying = false;
  let lastLocal = '';
  let lastChrome = '';

  async function pushLocalToChrome() {
    if (applying) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw === lastLocal) return;
    lastLocal = raw;
    try {
      applying = true;
      const parsed = JSON.parse(raw) as unknown;
      await chrome.storage.local.set({ [STORAGE_KEY]: parsed });
      lastChrome = raw;
    } catch {
      // ignore
    } finally {
      applying = false;
    }
  }

  async function pullChromeToLocal() {
    if (applying) return;
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const value = result[STORAGE_KEY];
    if (!value) return;
    try {
      const raw = JSON.stringify(value);
      if (raw === lastChrome || raw === localStorage.getItem(STORAGE_KEY)) return;
      applying = true;
      lastChrome = raw;
      lastLocal = raw;
      localStorage.setItem(STORAGE_KEY, raw);
      window.dispatchEvent(new CustomEvent('fitmirror-sync', { detail: raw }));
    } catch {
      // ignore
    } finally {
      applying = false;
    }
  }

  void pullChromeToLocal().then(() => pushLocalToChrome());

  window.addEventListener('storage', () => {
    void pushLocalToChrome();
  });

  setInterval(() => {
    void pushLocalToChrome();
  }, 1000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    void pullChromeToLocal();
  });
}
