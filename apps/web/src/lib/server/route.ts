import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { auth } from '@/auth';
import { adminIds } from './env';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAdmin(): Promise<string> {
  const s = await auth();
  const id = s?.user?.discordId;
  if (!id || !adminIds().has(id)) throw new HttpError(401, 'Unauthorized');
  return id;
}

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: { params: Record<string, string>; actor: string }) => Promise<unknown>;

/** Auth + zod + error mapping for every API route. Never leaks internals to the client. */
export function route(fn: Handler) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const actor = await requireAdmin();
      const out = await fn(req, { params: await ctx.params, actor });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError) {
        return NextResponse.json({ error: e.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ') }, { status: 400 });
      }
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      logger.error({ err: e instanceof Error ? e.message : String(e), url: req.url }, 'api error');
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  };
}

export async function body(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function notFound(what = 'Not found'): never {
  throw new HttpError(404, what);
}
