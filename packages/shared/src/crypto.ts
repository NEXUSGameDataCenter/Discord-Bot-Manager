import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM. Output: base64(iv[12] | tag[16] | ciphertext). Server-only. */
function keyFrom(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyHex), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decrypt(payload: string, keyHex: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 29) throw new Error('Ciphertext too short');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(keyHex), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
