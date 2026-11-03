import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Server-only asset storage: Supabase Storage when configured, else a local directory (dev). */
export interface AssetStore {
  kind: 'supabase' | 'local';
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export interface StoreEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ASSET_BUCKET?: string;
  UPLOAD_DIR?: string;
}

const safeKey = (key: string) => {
  if (!/^[a-zA-Z0-9._-]{1,200}$/.test(key)) throw new Error('Invalid asset key');
  return key;
};

export function createAssetStore(env: StoreEnv): AssetStore {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${env.ASSET_BUCKET ?? 'nexus-assets'}`;
    const headers = { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY };
    return {
      kind: 'supabase',
      async put(key, data, mime) {
        const res = await fetch(`${base}/${safeKey(key)}`, { method: 'POST', headers: { ...headers, 'content-type': mime, 'x-upsert': 'true' }, body: new Uint8Array(data) });
        if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status}`);
      },
      async get(key) {
        const res = await fetch(`${base}/${safeKey(key)}`, { headers });
        if (!res.ok) throw new Error(`Supabase Storage download failed: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      },
    };
  }
  const dir = path.resolve(env.UPLOAD_DIR ?? './uploads');
  return {
    kind: 'local',
    async put(key, data) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, safeKey(key)), data);
    },
    get: (key) => readFile(path.join(dir, safeKey(key))),
  };
}
