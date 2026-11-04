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
  if (opts.body !== undefined || (opts.method && opts.method !== 'GET')) cache.clear();
  return json as T;
}

// Client cache: pages show the last data instantly, then refresh in the background
// (stale-while-revalidate). Identical requests in flight are shared.
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

function load<T>(url: string): Promise<T> {
  let p = inflight.get(url) as Promise<T> | undefined;
  if (!p) {
    p = api<T>(url)
      .then((d) => {
        cache.set(url, d);
        return d;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p;
}

/** Start loading a URL early (e.g. on link hover) so the next page opens with data. */
export function prefetch(url: string) {
  if (!cache.has(url)) load(url).catch(() => undefined);
}

export function useApi<T>(url: string | null) {
  const [data, setDataState] = useState<T | undefined>(() => (url ? (cache.get(url) as T | undefined) : undefined));
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!!url && !cache.has(url));
  const reload = useCallback(() => {
    if (!url) return;
    if (cache.has(url)) setDataState(cache.get(url) as T);
    else setLoading(true);
    load<T>(url)
      .then((d) => {
        setDataState(d);
        setError(undefined);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);
  useEffect(() => reload(), [reload]);
  const setData = useCallback(
    (v: T | undefined | ((prev: T | undefined) => T | undefined)) =>
      setDataState((prev) => {
        const next = typeof v === 'function' ? (v as (p: T | undefined) => T | undefined)(prev) : v;
        if (url) cache.set(url, next);
        return next;
      }),
    [url],
  );
  return { data, error, loading, reload, setData };
}

// One shared SSE connection for the whole app instead of one per component.
const listeners = new Set<(ev: NexusEvent) => void>();
let source: EventSource | null = null;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

/** Live updates over SSE; auto-reconnects (EventSource default). */
export function useEvents(handler: (ev: NexusEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (ev: NexusEvent) => ref.current(ev);
    listeners.add(fn);
    clearTimeout(closeTimer);
    if (!source) {
      source = new EventSource('/api/events');
      source.onmessage = (m) => {
        let ev: NexusEvent;
        try {
          ev = JSON.parse(m.data) as NexusEvent;
        } catch {
          return;
        }
        listeners.forEach((l) => l(ev));
      };
    }
    return () => {
      listeners.delete(fn);
      // Keep the connection briefly so page changes do not reconnect.
      if (!listeners.size)
        closeTimer = setTimeout(() => {
          if (!listeners.size) {
            source?.close();
            source = null;
          }
        }, 5000);
    };
  }, []);
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(d)) : '—';

export const statusClass = (s: string | null | undefined) =>
  ({ ONLINE: 'success', SYNCED: 'success', SENT: 'success', DONE: 'success', success: 'success', STARTING: 'warning', PENDING: 'warning', QUEUED: 'warning', SENDING: 'warning', SCHEDULED: 'info', PARTIAL: 'warning', queued: 'info', partial: 'warning', FAILED: 'failed', ERROR: 'failed', OFFLINE: 'failed', failed: 'failed' })[s ?? ''] ?? 'info';
