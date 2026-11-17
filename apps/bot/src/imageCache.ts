import sharp from 'sharp';
import { prisma } from '@nexus/db';
import { store } from './assets';
import { fetchImage } from './workers/delivery';
import { logger } from './logger';

/**
 * Images sent with reaction-role button replies, kept in memory already compressed so a click
 * only has to upload a small file. Uploaded assets never change (cached until evicted);
 * image links are re-fetched after an hour.
 */
type Entry = { data: Buffer; name: string; at: number; size: number };
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();
const MAX_BYTES = 150 * 1024 * 1024;
const LINK_TTL = 60 * 60_000;
let total = 0;

function put(key: string, e: Entry) {
  const old = cache.get(key);
  if (old) total -= old.size;
  cache.set(key, e);
  total += e.size;
  // Evict oldest-inserted until under budget (Map keeps insertion order; reads re-insert).
  for (const [k, v] of cache) {
    if (total <= MAX_BYTES) break;
    cache.delete(k);
    total -= v.size;
  }
}

/** WebP, at most 1600px wide; animated GIFs and small files are kept as they are. */
async function compress(data: Buffer, name: string): Promise<{ data: Buffer; name: string }> {
  try {
    if (data.length < 150 * 1024) return { data, name };
    const img = sharp(data, { animated: true });
    const meta = await img.metadata();
    if ((meta.pages ?? 1) > 1) return { data, name };
    const out = await img.rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return out.length < data.length ? { data: out, name: name.replace(/\.\w+$/, '') + '.webp' } : { data, name };
  } catch (err) {
    logger.warn({ err: (err as Error).message, name }, 'image compress failed, sending original');
    return { data, name };
  }
}

async function load(key: string, fetcher: () => Promise<{ data: Buffer; name: string }>): Promise<Entry> {
  const hit = cache.get(key);
  if (hit && (!key.startsWith('url:') || Date.now() - hit.at < LINK_TTL)) {
    cache.delete(key);
    cache.set(key, hit); // most recently used goes to the end
    return hit;
  }
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const raw = await fetcher();
      const c = await compress(raw.data, raw.name);
      const e = { ...c, at: Date.now(), size: c.data.length };
      put(key, e);
      return e;
    })().finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

const assetKey = (id: string) => `asset:${id}`;
const urlKey = (u: string) => `url:${u}`;

async function loadAsset(id: string) {
  return load(assetKey(id), async () => {
    const a = await prisma.asset.findUniqueOrThrow({ where: { id } });
    return { data: await store.get(a.storedAs), name: a.fileName };
  });
}
const loadUrl = (u: string, i: number) => load(urlKey(u), async () => { const f = await fetchImage(u, i); return { data: f.attachment, name: f.name }; });

/** Files for one reply; a broken link is skipped instead of failing the reply. */
export async function replyImages(b: { replyFiles: string[]; replyImageUrls: string[] }): Promise<{ attachment: Buffer; name: string }[]> {
  const jobs = [...b.replyFiles.map((id) => loadAsset(id)), ...b.replyImageUrls.map((u, i) => loadUrl(u, i))];
  const res = await Promise.allSettled(jobs);
  return res.flatMap((r) => (r.status === 'fulfilled' ? [{ attachment: r.value.data, name: r.value.name }] : (logger.warn({ err: String(r.reason) }, 'reply image failed'), [])));
}

/** Warm the cache for one menu (after it is saved) or for every enabled menu (at start). */
export async function prefetchMenu(config: unknown): Promise<void> {
  const rows = ((config as { rows?: { replyFiles?: string[]; replyImageUrls?: string[] }[][] } | null)?.rows ?? []).flat();
  await Promise.allSettled(rows.flatMap((b) => [...(b.replyFiles ?? []).map((id) => loadAsset(id)), ...(b.replyImageUrls ?? []).map((u, i) => loadUrl(u, i))]));
}

export async function prefetchAll(): Promise<void> {
  const menus = await prisma.roleMenu.findMany({ where: { enabled: true }, select: { config: true } }).catch(() => []);
  for (const m of menus) await prefetchMenu(m.config);
  logger.info({ images: cache.size, mb: Math.round(total / 1048576) }, 'reply image cache warmed');
}
