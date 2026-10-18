// A short message on the shopping page, injected by the background script with
// chrome.scripting.executeScript, so it works without touching the page dock
// or the side panel. Must stay self-contained: the function is serialized and
// run in the page, so it can't use imports or outer variables.
export function showToastInPage(message: string, kind: 'error' | 'info'): void {
  const id = 'fitmirror-toast';
  document.getElementById(id)?.remove();
  const host = document.createElement('div');
  host.id = id;
  const root = host.attachShadow({ mode: 'open' });
  const box = document.createElement('div');
  box.setAttribute('role', 'status');
  box.textContent = message;
  box.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'left:50%',
    'bottom:24px',
    'transform:translateX(-50%)',
    'max-width:min(420px, calc(100vw - 32px))',
    'padding:10px 14px',
    'border-radius:10px',
    'font:600 13px/1.4 ui-sans-serif, system-ui, sans-serif',
    `background:${kind === 'error' ? '#7f1d1d' : '#0b6e6e'}`,
    'color:#fff',
    'box-shadow:0 10px 30px rgba(0,0,0,.25)',
  ].join(';');
  root.append(box);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 6000);
}
