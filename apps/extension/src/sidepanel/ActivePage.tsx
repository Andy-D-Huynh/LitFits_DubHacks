import { useEffect, useState } from 'react';
import type { GarmentCategory } from '../lib/types';
import type { PageProduct } from '../lib/parse-product';

type ReadResult =
  | { status: 'loading' }
  | { status: 'empty'; detail: string }
  | { status: 'ready'; product: PageProduct; tabId: number }
  | { status: 'error'; detail: string };

const CATEGORIES: GarmentCategory[] = [
  'top',
  'bottom',
  'outerwear',
  'dress',
  'footwear',
  'accessory',
];

async function activeHttpTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) return null;
  return tab;
}

export function ActivePage({ onWorn }: { onWorn: () => void }) {
  const [state, setState] = useState<ReadResult>({ status: 'loading' });
  const [category, setCategory] = useState<GarmentCategory>('top');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function readTab() {
    setNote(null);
    const tab = await activeHttpTab();
    if (!tab?.id) {
      setState({
        status: 'empty',
        detail: 'Open a clothing product page in this window. FitMirror reads that site, not a built-in shop.',
      });
      return;
    }
    try {
      const res = (await chrome.tabs.sendMessage(tab.id, { type: 'fitmirror:read-page' })) as
        | { ok?: boolean; product?: PageProduct }
        | undefined;
      if (!res?.ok || !res.product) {
        setState({
          status: 'empty',
          detail: 'Reload the product page so FitMirror can read it.',
        });
        return;
      }
      setCategory(res.product.category);
      setState({ status: 'ready', product: res.product, tabId: tab.id });
    } catch {
      setState({
        status: 'empty',
        detail: 'Reload the product page so FitMirror can read it.',
      });
    }
  }

  useEffect(() => {
    void readTab();
    const onActivated = () => void readTab();
    const onUpdated = (tabId: number, info: { status?: string }) => {
      if (info.status === 'complete') {
        void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.id === tabId) void readTab();
        });
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  async function openRetail(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setNote('Paste a full http or https product link.');
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setNote('Paste a full http or https product link.');
      return;
    }
    await chrome.tabs.create({ url: parsed.toString(), active: true });
    setUrl('');
    setNote('Opened that site. When the product page finishes loading, it shows up here.');
  }

  async function wear() {
    if (state.status !== 'ready') return;
    setBusy(true);
    setNote(null);
    try {
      const res = (await chrome.tabs.sendMessage(state.tabId, {
        type: 'fitmirror:wear-page',
        category,
      })) as { ok?: boolean; error?: string } | undefined;
      if (!res?.ok) throw new Error(res?.error || 'Could not add this product');
      setNote('Added from this page. The outfit is saved in the extension.');
      onWorn();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Could not add this product');
    } finally {
      setBusy(false);
    }
  }

  const product = state.status === 'ready' ? state.product : null;

  return (
    <section
      style={{
        marginBottom: 14,
        padding: 10,
        border: '1px solid #c5ced6',
        borderRadius: 8,
        background: '#f7f9fb',
      }}
    >
      <p
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: '#5c6b76',
          margin: '0 0 6px',
        }}
      >
        Page you have open
      </p>
      {state.status === 'loading' ? (
        <p style={{ fontSize: 12, margin: 0 }}>Reading the active tab…</p>
      ) : null}
      {state.status === 'empty' || state.status === 'error' ? (
        <p style={{ fontSize: 12, margin: 0, color: '#5c6b76', lineHeight: 1.4 }}>
          {state.detail}
        </p>
      ) : null}
      {product ? (
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>{product.name}</p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#5c6b76' }}>
            {product.retailer ?? 'this site'}
            {product.brand ? ` · ${product.brand}` : ''}
            {product.price ? ` · ${product.price.amount} ${product.price.currency}` : ''}
          </p>
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              style={{
                width: '100%',
                height: 120,
                objectFit: 'contain',
                background: '#e8eef3',
                borderRadius: 6,
              }}
            />
          ) : (
            <p style={{ fontSize: 12, color: '#b91c1c' }}>No product image on this page yet.</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  borderRadius: 4,
                  border: '1px solid #c5ced6',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  background: category === c ? '#0b6e6e' : '#fff',
                  color: category === c ? '#fff' : '#142028',
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !product.imageUrl}
            onClick={() => void wear()}
            style={{
              marginTop: 8,
              width: '100%',
              border: 'none',
              borderRadius: 6,
              padding: 8,
              fontSize: 12,
              fontWeight: 700,
              background: '#0b6e6e',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {busy ? 'Generating…' : 'Try this page on'}
          </button>
        </div>
      ) : null}

      <form onSubmit={(e) => void openRetail(e)} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://store.example/product"
          style={{
            flex: 1,
            minWidth: 0,
            border: '1px solid #c5ced6',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          style={{
            border: '1px solid #c5ced6',
            borderRadius: 6,
            background: '#fff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Open
        </button>
      </form>
      <button
        type="button"
        onClick={() => void readTab()}
        style={{
          marginTop: 6,
          border: 'none',
          background: 'none',
          padding: 0,
          fontSize: 11,
          color: '#0b6e6e',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Re-read this tab
      </button>
      {note ? <p style={{ fontSize: 11, margin: '6px 0 0', color: '#142028' }}>{note}</p> : null}
    </section>
  );
}
