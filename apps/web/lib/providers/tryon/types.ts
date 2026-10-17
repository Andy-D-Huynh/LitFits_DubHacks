// See docs/tryon.md.
export type TryOnCategory = 'upper_body' | 'lower_body' | 'dresses';

export interface TryOnInput {
  personImageUrl: string;
  garmentImageUrl: string;
  category: TryOnCategory;
  description: string;
}

export interface TryOnProvider {
  readonly name: string;
  render(input: TryOnInput): Promise<{ imageUrl: string }>;
}
