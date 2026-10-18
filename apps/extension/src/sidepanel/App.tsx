import { useEffect, useState } from 'react';
import { extractOutline } from '../lib/outline';
import {
  dismissFigure,
  loadFigure,
  saveFigure,
  setModelPhoto,
} from '../lib/storage';
import type { FigurePersist, OutfitSlots } from '../lib/types';
import { ActivePage } from './ActivePage';
import { OutlineView } from './OutlineView';

function slotEntries(slots: OutfitSlots) {
  return (
    [
      ['dress', slots.dress],
      ['top', slots.top],
      ['bottom', slots.bottom],
      ['footwear', slots.footwear],
      ['outerwear', slots.outerwear],
      ['accessory', slots.accessory],
    ] as const
  ).filter(([, g]) => g);
}

export function App() {
  const [data, setData] = useState<FigurePersist | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('read failed'));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const silhouette = await extractOutline(dataUrl);
      setData(await setModelPhoto(dataUrl, silhouette));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create outline');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <main style={{ padding: 16, fontFamily: 'system-ui' }}>Loading…</main>;
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 14, color: '#142028' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>FitMirror</h1>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#5c6b76', lineHeight: 1.4 }}>
        Your photo stays in the bottom corner of every shopping tab. Click Try this on and the server
        generates a new image with Fashn. Each piece’s link is saved for the cart.
      </p>

      <ActivePage onWorn={() => void refresh()} />

      {data.avatarImageUrl ? (
        <img
          src={data.avatarImageUrl}
          alt="Latest try-on"
          style={{ width: '100%', borderRadius: 8, background: '#e8eef3', marginBottom: 10 }}
        />
      ) : null}

      <OutlineView data={data} />

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <label
          style={{
            flex: 1,
            textAlign: 'center',
            background: '#0b6e6e',
            color: '#fff',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {busy ? 'Tracing…' : data.silhouette ? 'Recapture photo' : 'Upload your photo'}
          <input
            type="file"
            accept="image/*,.heic,.heif"
            style={{ display: 'none' }}
            onChange={(e) => void onUpload(e.target.files?.[0])}
          />
        </label>
        {data.silhouette ? (
          <button
            type="button"
            style={{
              border: '1px solid #c5ced6',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 12,
              background: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => void dismissFigure().then(setData)}
          >
            Dismiss
          </button>
        ) : null}
      </div>
      {error ? <p style={{ color: '#b91c1c', fontSize: 12 }}>{error}</p> : null}

      <section style={{ marginTop: 14 }}>
        <p
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#5c6b76',
            margin: '0 0 6px',
          }}
        >
          Cart links
        </p>
        {data.liked.length === 0 ? (
          <p style={{ fontSize: 12, color: '#5c6b76', margin: '0 0 12px' }}>
            Try a piece on and its product link is saved here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', fontSize: 12 }}>
            {data.liked.map((item) => (
              <li key={item.id} style={{ marginBottom: 6 }}>
                <a href={item.productUrl} target="_blank" rel="noreferrer" style={{ color: '#0b6e6e' }}>
                  {item.name}
                </a>
                {item.retailer ? <span style={{ color: '#5c6b76' }}> · {item.retailer}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <p
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#5c6b76',
            margin: '0 0 6px',
          }}
        >
          Wearing
        </p>
        {slotEntries(data.slots).length === 0 ? (
          <p style={{ fontSize: 12, color: '#5c6b76', margin: 0 }}>
            Open a product page, then wear it from the panel above. You can also use Add to Figure
            on the page itself.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
            {slotEntries(data.slots).map(([slot, g]) => (
              <li
                key={slot}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {slot} · {g!.name}
                  {g!.retailer ? ` (${g!.retailer})` : ''}
                </span>
                <button
                  type="button"
                  style={{ fontSize: 11, cursor: 'pointer' }}
                  onClick={() => {
                    void (async () => {
                      const next = { ...data, slots: { ...data.slots, [slot]: null } };
                      await saveFigure(next);
                      setData(next);
                    })();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {slotEntries(data.slots).length > 0 ? (
          <button
            type="button"
            style={{
              marginTop: 6,
              width: '100%',
              border: '1px solid #c5ced6',
              borderRadius: 6,
              padding: 8,
              fontSize: 12,
              background: '#fff',
              cursor: 'pointer',
            }}
            onClick={() => {
              void (async () => {
                const next = {
                  ...data,
                  slots: {
                    top: null,
                    bottom: null,
                    outerwear: null,
                    dress: null,
                    footwear: null,
                    accessory: null,
                  },
                };
                await saveFigure(next);
                setData(next);
              })();
            }}
          >
            Clear clothes
          </button>
        ) : null}
      </section>

      {data.closet.length > 0 ? (
        <section style={{ marginTop: 14 }}>
          <p
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#5c6b76',
              margin: '0 0 6px',
            }}
          >
            Closet (from any site)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {data.closet.slice(0, 8).map((g) => {
              const img = g.imageDataUrl || g.primaryImageUrl;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const { wearOnFigure } = await import('../lib/storage');
                      setData(await wearOnFigure(g));
                    })();
                  }}
                  style={{
                    border: '1px solid #c5ced6',
                    borderRadius: 6,
                    padding: 0,
                    overflow: 'hidden',
                    background: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      height: 72,
                      background: img
                        ? `center/cover url(${img})`
                        : '#d0d7de',
                    }}
                  />
                  <div style={{ padding: '4px 6px', fontSize: 10 }}>
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: 600,
                      }}
                    >
                      {g.name}
                    </div>
                    <div style={{ color: '#5c6b76' }}>{g.retailer ?? g.category}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {data.savedOutfits.length > 0 ? (
        <section style={{ marginTop: 14 }}>
          <p
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: '#5c6b76',
              margin: '0 0 6px',
            }}
          >
            Auto-saved outfits
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
            {data.savedOutfits.slice(0, 16).map((o) => (
              <li key={o.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    color: '#0b6e6e',
                  }}
                  onClick={() => {
                    void (async () => {
                      const next = { ...data, slots: structuredClone(o.slots), visible: true };
                      await saveFigure(next);
                      setData(next);
                    })();
                  }}
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
