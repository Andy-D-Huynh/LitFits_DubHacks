export type FashnCategory = 'tops' | 'bottoms' | 'one-pieces' | 'auto';

/** Map a page category onto the categories Fashn v1.6 accepts. */
export function fashnCategory(category: string | null | undefined): FashnCategory {
  if (category === 'top' || category === 'outerwear' || category === 'tops') return 'tops';
  if (category === 'bottom' || category === 'bottoms') return 'bottoms';
  if (category === 'dress' || category === 'one-pieces') return 'one-pieces';
  return 'auto';
}
