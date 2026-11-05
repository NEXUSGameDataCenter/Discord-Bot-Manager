'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, useApi, useEvents } from '@/lib/client';
import { NavIcon } from './NavIcon';
import { useMe, useToast } from './Shell';

type Item = { id: string; kind: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
const ICON: Record<string, string> = { delivery_failed: 'mega', schedule_sent: 'clock', bot_status: 'bot', join_request: 'join', moderation: 'shield' };
const TONE: Record<string, string> = { delivery_failed: 'var(--red)', schedule_sent: 'var(--green)', bot_status: 'var(--yellow)', join_request: 'var(--acc)', moderation: 'var(--green)' };
type Filter = 'all' | 'unread' | 'ann' | 'sys';
const isAnn = (k: string) => k === 'delivery_failed' || k === 'schedule_sent';

function when(d: string) {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 6e4);
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  if (m < 1440) return `${Math.round(m / 60)} ชม.ที่แล้ว`;
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(d));
}

/** Bell with unread count and a dropdown list; live via the shared SSE stream. */
export function Bell() {
  const me = useMe();
  const toast = useToast();
  const { data, reload, setData } = useApi<{ items: Item[]; unread: number }>('/api/notifications');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null>(null);

  useEvents((ev) => {
    if (ev.type === 'notify' && ev.emails.includes(me.email.toLowerCase())) reload();
  });
  // Toast the newest unread item when it arrives while the page is open.
  useEffect(() => {
    const top = data?.items[0];
    if (!top) return;
    if (seen.current && seen.current !== top.id && !top.readAt) toast(top.title);
    seen.current = top.id;
  }, [data, toast]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const markRead = async (ids?: string[]) => {
    const now = new Date().toISOString();
    setData((d) => d && { items: d.items.map((i) => (!ids || ids.includes(i.id) ? { ...i, readAt: i.readAt ?? now } : i)), unread: ids ? Math.max(0, d.unread - ids.length) : 0 });
    await api('/api/notifications', { method: 'POST', body: ids ? { ids } : { all: true } }).catch(() => undefined);
  };
  const items = (data?.items ?? []).filter((i) => filter === 'all' || (filter === 'unread' ? !i.readAt : filter === 'ann' ? isAnn(i.kind) : !isAnn(i.kind)));
  const unread = data?.unread ?? 0;

  return (
    <div className="bellwrap" ref={box}>
      <button className="bell" onClick={() => setOpen(!open)} aria-label={`การแจ้งเตือน${unread ? ` ${unread} รายการยังไม่อ่าน` : ''}`} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="bdot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bpanel" role="dialog" aria-label="การแจ้งเตือน">
          <div className="bph"><b>การแจ้งเตือน</b><span style={{ flex: 1 }} />{unread > 0 && <button className="linkbtn" onClick={() => markRead()}>อ่านทั้งหมดแล้ว</button>}</div>
          <div className="btabs">
            {([['all', 'ทั้งหมด'], ['unread', 'ยังไม่อ่าน'], ['ann', 'ประกาศ'], ['sys', 'ระบบ']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div className="blist">
            {!items.length && <div className="empty" style={{ padding: 32, textAlign: 'center' }}>ไม่มีการแจ้งเตือน</div>}
            {items.map((i) => {
              const row = (
                <>
                  <span className="bico" style={{ color: TONE[i.kind] }}><NavIcon name={ICON[i.kind] ?? 'bell'} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="bt">{i.title}</span>
                    <span className="bm">{i.body ? `${i.body} · ` : ''}{when(i.createdAt)}</span>
                  </span>
                  <span className={`bu ${i.readAt ? 'read' : ''}`} />
                </>
              );
              return i.link ? (
                <Link key={i.id} href={i.link} className={`bitem ${i.readAt ? 'read' : ''}`} onClick={() => { if (!i.readAt) void markRead([i.id]); setOpen(false); }}>{row}</Link>
              ) : (
                <button key={i.id} className={`bitem ${i.readAt ? 'read' : ''}`} onClick={() => !i.readAt && markRead([i.id])}>{row}</button>
              );
            })}
          </div>
          <div className="bpf"><Link href="/me#notify" onClick={() => setOpen(false)}>ตั้งค่าการแจ้งเตือน</Link><span className="muted">เก็บไว้ 30 วัน</span></div>
        </div>
      )}
    </div>
  );
}
