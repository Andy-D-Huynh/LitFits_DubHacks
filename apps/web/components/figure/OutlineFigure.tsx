'use client';

import { useId } from 'react';
import { colorForGarment } from '@/lib/garments/demo-closet';
import { DEFAULT_GARMENT_TRANSFORM, DEFAULT_LAYER_ORDER } from '@/lib/figure/contracts';
import type {
  GarmentTransform,
  OutfitSlots,
  SilhouetteResult,
  WornGarment,
} from '@/lib/opencv/types';

type Props = {
  silhouette: SilhouetteResult;
  slots: OutfitSlots;
  className?: string;
  /** Extra disambiguator when the same silhouette is mounted twice. */
  instanceId?: string;
};

function safeId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned.length > 0 ? cleaned : 'figure';
}

function firstUrl(...urls: Array<string | null | undefined>): string | null {
  for (const url of urls) {
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return null;
}

function layerRank(garment: WornGarment): number {
  if (typeof garment.layerOrder === 'number' && Number.isFinite(garment.layerOrder)) {
    return garment.layerOrder;
  }
  return DEFAULT_LAYER_ORDER[garment.category] ?? DEFAULT_LAYER_ORDER.top;
}

function transformOf(garment: WornGarment): GarmentTransform {
  const t = garment.transform;
  if (
    t &&
    Number.isFinite(t.x) &&
    Number.isFinite(t.y) &&
    Number.isFinite(t.scaleX) &&
    Number.isFinite(t.scaleY) &&
    Number.isFinite(t.rotation)
  ) {
    return t;
  }
  return DEFAULT_GARMENT_TRANSFORM[garment.category] ?? DEFAULT_GARMENT_TRANSFORM.top;
}

/** Occupied slots, bottom layer first. Dress vs top/bottom is already resolved in the store. */
function layeredSlots(slots: OutfitSlots): WornGarment[] {
  const items = [slots.bottom, slots.top, slots.dress, slots.outerwear].filter(
    (garment): garment is WornGarment => Boolean(garment),
  );
  return items
    .map((garment, index) => ({ garment, index }))
    .sort((a, b) => layerRank(a.garment) - layerRank(b.garment) || a.index - b.index)
    .map((entry) => entry.garment);
}

function GarmentLayer({
  garment,
  width,
  height,
}: {
  garment: WornGarment;
  width: number;
  height: number;
}) {
  const transform = transformOf(garment);
  const x = transform.x * width;
  const y = transform.y * height;
  const w = transform.scaleX * width;
  const h = transform.scaleY * height;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotate = `rotate(${transform.rotation} ${cx} ${cy})`;
  const src = firstUrl(garment.transparentImageUrl, garment.imageDataUrl, garment.primaryImageUrl);
  const opacity = garment.category === 'outerwear' ? 0.92 : 0.95;

  if (src) {
    return (
      <image
        href={src}
        x={x}
        y={y}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid slice"
        opacity={opacity}
        transform={rotate}
      />
    );
  }

  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill={colorForGarment(garment.primaryColor)}
      opacity={opacity}
      transform={rotate}
    />
  );
}

/** Layered clothing clipped to the outline. Placement is a 2D preview, not a photoreal try-on. */
export function OutlineFigure({ silhouette, slots, className, instanceId }: Props) {
  const reactId = safeId(useId());
  const silId = safeId(silhouette.id ?? 'outline');
  const extra = instanceId ? `-${safeId(instanceId)}` : '';
  const clipId = `figure-clip-${silId}${extra}-${reactId}`;

  const width = Number.isFinite(silhouette.width) && silhouette.width > 0 ? silhouette.width : 1;
  const height = Number.isFinite(silhouette.height) && silhouette.height > 0 ? silhouette.height : 1;
  const outline = Array.isArray(silhouette.outline) ? silhouette.outline : [];
  const pathD =
    outline.length > 0
      ? `M ${outline.map((p) => `${p.x * width},${p.y * height}`).join(' L ')} Z`
      : '';
  const layers = layeredSlots(slots);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className={className}
      role="img"
      aria-label="Your border-line figure"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={pathD} />
        </clipPath>
      </defs>

      <path d={pathD} fill="rgba(245, 240, 232, 0.95)" />

      <g clipPath={`url(#${clipId})`}>
        {layers.map((garment) => (
          <GarmentLayer
            key={`${garment.category}-${garment.id}`}
            garment={garment}
            width={width}
            height={height}
          />
        ))}
      </g>

      <path
        d={pathD}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={Math.max(2.5, width * 0.01)}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
