import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { prisma, type TeamMember } from '@nexus/db';
import { hasRole, type TeamRole } from '@nexus/shared';
import { auth } from '@/auth';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Re-reads the member from the DB on every request: removing or disabling someone takes effect immediately. */
export async function requireUser(min: TeamRole = 'EDITOR'): Promise<TeamMember> {
  const s = await auth();
  const id = s?.user?.id;
  if (!id) throw new HttpError(401, 'Unauthorized');
  const m = await prisma.teamMember.findUnique({ where: { id } });
  if (!m || m.status !== 'ACTIVE') throw new HttpError(401, 'Unauthorized');
  if (!hasRole(m.role, min)) throw new HttpError(403, 'สิทธิ์ของคุณไม่พอสำหรับการดำเนินการนี้ — ติดต่อ Owner ของทีม');
  return m;
}

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: { params: Record<string, string>; actor: string; member: TeamMember }) => Promise<unknown>;

/** Role guard + zod + error mapping for every API route. Never leaks internals to the client. */
export function routeAs(min: TeamRole, fn: Handler) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const member = await requireUser(min);
      const out = await fn(req, { params: await ctx.params, actor: member.email, member });
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

/** Default guard is ADMIN. Use routeAs('EDITOR', ...) for read and announcement routes, 'OWNER' for team management. */
export const route = (fn: Handler) => routeAs('ADMIN', fn);

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
