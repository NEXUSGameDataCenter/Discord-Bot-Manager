import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '@nexus/db';
import { ATTACHMENT_MAX_BYTES, IMAGE_MAX_BYTES, IMAGE_MIME } from '@nexus/shared';
import { route, HttpError } from '@/lib/server/route';
import { assetStore } from '@/lib/server/env';

export const runtime = 'nodejs';

/** Detect the real image type from magic bytes instead of trusting the browser. */
function sniffImage(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && b.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif';
  if (b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
const EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

export const POST = route(async (req) => {
  const form = await req.formData();
  const kind = form.get('kind');
  const file = form.get('file');
  if (kind !== 'image' && kind !== 'attachment') throw new HttpError(400, 'kind must be image or attachment');
  if (!(file instanceof File)) throw new HttpError(400, 'file is required');
  const buf = Buffer.from(await file.arrayBuffer());
  let mime = file.type || 'application/octet-stream';
  let ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  if (kind === 'image') {
    if (buf.length > IMAGE_MAX_BYTES) throw new HttpError(400, `รูปต้องไม่เกิน ${IMAGE_MAX_BYTES / 1024 / 1024}MB`);
    const real = sniffImage(buf);
    if (!real || !(IMAGE_MIME as readonly string[]).includes(real)) throw new HttpError(400, 'รองรับเฉพาะ PNG, JPG, GIF, WEBP');
    mime = real;
    ext = EXT[real]!;
  } else if (buf.length > ATTACHMENT_MAX_BYTES) {
    throw new HttpError(400, `ไฟล์แนบต้องไม่เกิน ${ATTACHMENT_MAX_BYTES / 1024 / 1024}MB`);
  }
  const storedAs = `${randomUUID()}${ext}`;
  await assetStore().put(storedAs, buf, mime);
  const fileName = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 100) || `file${ext}`;
  const asset = await prisma.asset.create({ data: { kind, mime, size: buf.length, fileName, storedAs } });
  return { asset: { id: asset.id, fileName, size: asset.size, mime, url: `/api/assets/${asset.id}` } };
});
