import { placeOutfit } from '../lib/placement';
import type { FigurePersist, WornGarment } from '../lib/types';

function src(g: WornGarment) {
  return g.cutoutDataUrl || g.imageDataUrl || g.primaryImageUrl;
}

export function OutlineView({ data }: { data: FigurePersist }) {
  const { silhouette } = data;
  if (!silhouette) {
    return (
      <div
        style={{
          aspectRatio: '3/4',
          border: '1px dashed #c5ced6',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          textAlign: 'center',
          fontSize: 12,
          color: '#5c6b76',
          background: '#eef1f4',
        }}
      >
        Upload a full-body photo below. The figure stays in this extension while you browse
        clothing sites.
      </div>
    );
  }

  const { outline, width, height } = silhouette;
  const pathD =
    outline.length > 0
      ? `M ${outline.map((p) => `${p.x * width},${p.y * height}`).join(' L ')} Z`
      : '';
  const layers = placeOutfit(data.slots);
  const soft = layers.filter((layer) => layer.track === 'soft');
  const rigid = layers.filter((layer) => layer.track === 'rigid');

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          aspectRatio: `${width} / ${height}`,
          background: '#e8eef3',
          borderRadius: 8,
          border: '1px solid #c5ced6',
        }}
      >
        <defs>
          <clipPath id="body">
            <path d={pathD} />
          </clipPath>
        </defs>
        <path d={pathD} fill="rgba(245,240,232,0.95)" />
        <g clipPath="url(#body)">
          {soft.map(({ garment, zone }) => (
            <GarmentImage key={garment.id} garment={garment} zone={zone} width={width} height={height} />
          ))}
        </g>
        {rigid.map(({ garment, zone }) => (
          <GarmentImage key={garment.id} garment={garment} zone={zone} width={width} height={height} />
        ))}
        <path d={pathD} fill="none" stroke="#1a1a1a" strokeWidth={3} strokeLinejoin="round" />
      </svg>
      <p style={{ margin: '6px 0 0', fontSize: 10, color: '#5c6b76', lineHeight: 1.35 }}>
        2D preview from the pages you open. Plain-background photos are cut out. Model photos stay
        as positioned previews — this is not a photorealistic try-on.
      </p>
    </div>
  );
}

function GarmentImage({
  garment,
  zone,
  width,
  height,
}: {
  garment: WornGarment;
  zone: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
}) {
  const href = src(garment);
  if (!href) {
    return (
      <rect
        x={zone.x * width}
        y={zone.y * height}
        width={zone.w * width}
        height={zone.h * height}
        fill="#8a8a8a"
        opacity={0.9}
      />
    );
  }
  return (
    <image
      href={href}
      x={zone.x * width}
      y={zone.y * height}
      width={zone.w * width}
      height={zone.h * height}
      preserveAspectRatio="xMidYMid meet"
      opacity={0.95}
    />
  );
}
