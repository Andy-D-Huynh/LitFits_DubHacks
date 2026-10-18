import { useEffect, useRef, useState } from 'react';
import { extractOutline } from '../lib/outline';
import { fileToModelImage } from '../lib/photo';
import {
  dismissFigure,
  loadFigure,
  markAllInCart,
  removeGarment,
  setModelPhoto,
  toggleCart,
} from '../lib/storage';
import type { FigurePersist, LikedGarment } from '../lib/types';
import { ActivePage } from './ActivePage';
import { OutlineView } from './OutlineView';

function cleanSiteName(item: LikedGarment): string {
  if (item.retailer && item.retailer.trim()) return item.retailer.trim();
  try {
    const host = new URL(item.productUrl).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    return (parts.length >= 2 && parts[0]) ? parts[0] : host;
  } catch {
    return 'Store';
  }
}

export function App() {
  const [data, setData] = useState<FigurePersist | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setData(await loadFigure());
  }

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    chrome.storage.onChanged.addListener(onChange);
    chrome.runtime.onMessage.addListener(onChange);
    return () => {
      chrome.storage.onChanged.removeListener(onChange);
      chrome.runtime.onMessage.removeListener(onChange);
    };
  }, []);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToModelImage(file);
      let silhouette = null;
      try {
        silhouette = await extractOutline(dataUrl);
      } catch {
        silhouette = null;
      }
      setData(await setModelPhoto(dataUrl, silhouette));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save photo';
      setError(
        message.includes('QUOTA')
          ? 'Photo is too large to store. Try a smaller image.'
          : message,
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (!data) {
    return (
      <main style={{ padding: 16, fontFamily: 'system-ui', color: '#64748b', fontSize: 13 }}>
        Loading…
      </main>
    );
  }

  const look = data.avatarImageUrl || data.modelImage;

  return (
    <main
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 14,
        color: '#0f172a',
        maxWidth: 360,
        margin: '0 auto',
      }}
    >
      {/* Sleek Minimal Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Avatar</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 999,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {busy ? 'Saving…' : look ? 'Change photo' : 'Add photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => void onUpload(e.target.files?.[0])}
          />
          {look ? (
            <button
              type="button"
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 11,
                color: '#64748b',
                background: '#ffffff',
                cursor: 'pointer',
              }}
              onClick={() => void dismissFigure().then(setData)}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          style={{
            color: '#b91c1c',
            fontSize: 12,
            background: '#fee2e2',
            padding: '6px 10px',
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Avatar Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          background: '#f1f5f9',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 4px 16px -2px rgba(15,23,42,0.08)',
          marginBottom: 14,
        }}
      >
        {look ? (
          <img
            src={look}
            alt="Avatar"
            style={{
              width: '100%',
              maxHeight: 340,
              objectFit: 'contain',
              display: 'block',
              background: '#f8fafc',
            }}
          />
        ) : (
          <div style={{ padding: 16 }}>
            <OutlineView data={data} />
          </div>
        )}
      </div>

      {/* Active Page Quick Try-On */}
      <ActivePage onWorn={() => void refresh()} />

      {/* Individual Clothes for Each Site */}
      {data.liked.length > 0 ? (
        <section style={{ marginTop: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#64748b',
              }}
            >
              Clothes ({data.liked.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.liked.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 10,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  gap: 8,
                }}
              >
                {item.garmentImageUrl ? (
                  <img
                    src={item.garmentImageUrl}
                    alt={item.name}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      objectFit: 'cover',
                      background: '#f1f5f9',
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
                      lineHeight: 1.1,
                    }}
                  >
                    {cleanSiteName(item)}
                  </div>
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#0f172a',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                      lineHeight: 1.3,
                    }}
                  >
                    {item.name}
                  </a>
                </div>

                {/* EXACTLY two icons: Cart and Remove */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {/* Cart Icon Button */}
                  <button
                    type="button"
                    title={item.inCart ? 'In cart' : 'Put in cart'}
                    onClick={() => {
                      void (async () => {
                        const next = await toggleCart(item.id);
                        setData(next);
                      })();
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: 'none',
                      background: item.inCart ? '#ecfdf5' : '#f8fafc',
                      color: item.inCart ? '#059669' : '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={item.inCart ? '#059669' : 'currentColor'}
                      strokeWidth={item.inCart ? '2.4' : '2'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="8" cy="21" r="1" fill={item.inCart ? '#059669' : 'none'} />
                      <circle cx="19" cy="21" r="1" fill={item.inCart ? '#059669' : 'none'} />
                      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                      {item.inCart ? <polyline points="9 11 12 14 17 9" /> : null}
                    </svg>
                  </button>

                  {/* Remove Icon Button */}
                  <button
                    type="button"
                    title="Remove from figure"
                    onClick={() => {
                      void (async () => {
                        const next = await removeGarment(item.id);
                        setData(next);
                      })();
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: 'none',
                      background: '#f8fafc',
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {data.liked.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const next = await markAllInCart();
                    setData(next);
                    const urls = data.liked.map((i) => i.productUrl).filter(Boolean);
                    if (urls.length > 0) {
                      void chrome.runtime.sendMessage({ type: 'fitmirror:open-tabs', urls });
                    }
                  })();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: data.liked.every((i) => i.inCart) ? '#ecfdf5' : '#0f172a',
                  color: data.liked.every((i) => i.inCart) ? '#059669' : '#ffffff',
                  border: data.liked.every((i) => i.inCart)
                    ? '1px solid rgba(5,150,105,0.2)'
                    : 'none',
                  borderRadius: 999,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                </svg>
                {data.liked.every((i) => i.inCart)
                  ? '✓ All in cart'
                  : `Put all into cart (${data.liked.length})`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
