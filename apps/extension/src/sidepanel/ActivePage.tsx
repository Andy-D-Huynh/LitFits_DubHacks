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

  if (!product) {
    return (
      <div
        style={{
          fontSize: 11,
          color: '#94a3b8',
          textAlign: 'center',
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px dashed #cbd5e1',
          marginBottom: 12,
        }}
      >
        Open a product page on any store to try it on
      </div>
    );
  }

  return (
    <section
      style={{
        marginBottom: 14,
        padding: 10,
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        background: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            style={{
              width: 50,
              height: 50,
              objectFit: 'cover',
              background: '#f1f5f9',
              borderRadius: 8,
              flexShrink: 0,
            }}
          />
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#64748b',
            }}
          >
            {product.retailer ?? 'Store'}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#0f172a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {product.name}
          </div>
          {product.price ? (
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {product.price.amount} {product.price.currency}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'capitalize',
              borderRadius: 999,
              border: category === c ? 'none' : '1px solid #e2e8f0',
              padding: '3px 8px',
              cursor: 'pointer',
              background: category === c ? '#0f172a' : '#f8fafc',
              color: category === c ? '#ffffff' : '#64748b',
              flexShrink: 0,
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
          borderRadius: 8,
          padding: '7px 12px',
          fontSize: 11,
          fontWeight: 600,
          background: '#0f172a',
          color: '#ffffff',
          cursor: 'pointer',
          opacity: busy || !product.imageUrl ? 0.6 : 1,
        }}
      >
        {busy ? 'Styling…' : 'Try on'}
      </button>

      {note ? <p style={{ fontSize: 11, margin: '6px 0 0', color: '#64748b' }}>{note}</p> : null}
    </section>
  );
}
