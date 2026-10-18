import 'server-only';
import { env } from './env';

type SearchParams = Record<string, string | string[] | undefined>;

// Demo mode: DEMO_MODE=true, or ?demo=1 on the request.
export function isDemo(searchParams?: SearchParams | URLSearchParams): boolean {
  if (env().DEMO_MODE) return true;
  if (!searchParams) return false;
  const demo =
    searchParams instanceof URLSearchParams ? searchParams.get('demo') : searchParams.demo;
  return demo === '1';
}
