import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json(details === undefined ? { error } : { error, details }, { status });
}

// Parses and validates a JSON body; returns the data or a 400 response.
export async function parseBody<T extends z.ZodType>(
  req: NextRequest,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: jsonError(400, 'Body must be JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: jsonError(400, 'Invalid request body', z.treeifyError(parsed.error)) };
  }
  return { data: parsed.data };
}

export const UuidParam = z.uuid();
