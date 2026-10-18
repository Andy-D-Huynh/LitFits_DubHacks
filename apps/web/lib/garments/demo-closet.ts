/** Fallback color when a product has no image. */
export function colorForGarment(color: string | null): string {
  if (!color) return '#8a8a8a';
  if (color.startsWith('#')) return color;
  const named: Record<string, string> = {
    white: '#f4f0e8',
    black: '#222222',
    khaki: '#c4a574',
    navy: '#2c3e6b',
    blue: '#4a6fa5',
    red: '#8b3a4a',
    green: '#3d5a4c',
    gray: '#7a7a7a',
    grey: '#7a7a7a',
  };
  return named[color.toLowerCase()] ?? '#8a8a8a';
}
