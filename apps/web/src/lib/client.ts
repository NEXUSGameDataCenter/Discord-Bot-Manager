'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NexusEvent } from '@nexus/shared';

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined && !isForm ? { 'content-type': 'application/json' } : undefined,
    body: isForm ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(json.error ?? `${res.status} ${res.statusText}`);
  return json as T;
}

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!url);
  const reload = useCallback(() => {
    if (!url) return;
    setLoading(true);
    api<T>(url)
      .then((d) => {
        setData(d);
        setError(undefined);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);
  useEffect(() => reload(), [reload]);
  return { data, error, loading, reload, setData };
}

/** Live updates over SSE; auto-reconnects (EventSource default). */
export function useEvents(handler: (ev: NexusEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (m) => {
      try {
        ref.current(JSON.parse(m.data) as NexusEvent);
      } catch {}
    };
    return () => es.close();
  }, []);
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(d)) : '—';

export const statusClass = (s: string | null | undefined) =>
  ({ ONLINE: 'success', SYNCED: 'success', SENT: 'success', DONE: 'success', success: 'success', STARTING: 'warning', PENDING: 'warning', QUEUED: 'warning', SENDING: 'warning', SCHEDULED: 'info', PARTIAL: 'warning', queued: 'info', partial: 'warning', FAILED: 'failed', ERROR: 'failed', OFFLINE: 'failed', failed: 'failed' })[s ?? ''] ?? 'info';
