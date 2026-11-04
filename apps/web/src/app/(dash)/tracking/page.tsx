'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHead, Loading, ErrorBox, Empty } from '@/components/Shell';
import { useApi, useEvents, fmtDate } from '@/lib/client';

type Row = { id: string; title: string; status: string; isTest: boolean; createdAt: string; targets: number; run: number; sent: number; failed: number; queued: number; deleted: number; schedule: { cron: string | null; runAt: string | null; active: boolean } | null };
type State = 'done' | 'partial' | 'failed' | 'sending' | 'scheduled' | 'deleted' | 'idle';
type Filter = 'all' | 'done' | 'problem' | 'sending' | 'deleted';

/** One plain-language state per announcement, from its latest run. */
function stateOf(a: Row): State {
  if (a.status === 'DELETED' || (a.deleted && !a.sent && !a.queued)) return 'deleted';
  if (a.queued || a.status === 'SENDING') return 'sending';
  if (a.failed && !a.sent) return 'failed';
  if (a.failed) return 'partial';
  if (a.schedule?.active && (a.status === 'SCHEDULED' || !a.run)) return 'scheduled';
  if (!a.run) return 'idle';
  return 'done';
}
const LABEL: Record<State, [tone: string, text: string]> = {
  done: ['ok', '✓ ส่งครบแล้ว'],
  partial: ['warn', '⚠ สำเร็จบางส่วน'],
  failed: ['bad', '✕ ล้มเหลว'],
  sending: ['info', '⏳ กำลังส่ง'],
  scheduled: ['info', '🗓 ตั้งเวลาไว้'],
  deleted: ['grey', '🗑 ลบแล้ว'],
  idle: ['grey', 'ยังไม่ได้ส่ง'],
};
const FILTERS: [Filter, string][] = [['all', 'ทั้งหมด'], ['done', 'ส่งครบ'], ['problem', 'มีปัญหา'], ['sending', 'กำลังส่ง / ตั้งเวลา'], ['deleted', 'ลบแล้ว']];
const match = (f: Filter, s: State) => f === 'all' || (f === 'problem' ? s === 'partial' || s === 'failed' : f === 'sending' ? s === 'sending' || s === 'scheduled' : s === f);

export default function TrackingPage() {
  const { data, error, loading, reload } = useApi<{ announcements: Row[] }>('/api/announcements');
  useEvents((ev) => (ev.type === 'delivery' ? reload() : undefined));
  const [filter, setFilter] = useState<Filter>('all');
  const list = data?.announcements ?? [];
  const totals = list.reduce((a, r) => ({ sent: a.sent + r.sent, queued: a.queued + r.queued, failed: a.failed + r.failed }), { sent: 0, queued: 0, failed: 0 });
  const rows = list.filter((a) => match(filter, stateOf(a)));
  return (
    <>
      <PageHead crumb="TRACKING" title="Delivery Tracking" sub="ติดตามสถานะการส่งข้อความ (รอบล่าสุดของแต่ละประกาศ)" />
      <div className="grid three" style={{ marginBottom: 14 }}>
        {([['ส่งสำเร็จ', totals.sent, '#34d399'], ['รอส่ง', totals.queued, '#fbbf24'], ['ล้มเหลว', totals.failed, '#fb7185']] as const).map(([l, v, c]) => (
          <section className="card" key={l}><div className="statvalue" style={{ color: c }}>{v}</div><div className="statlabel">{l}</div></section>
        ))}
      </div>
      <div className="chips">
        {FILTERS.map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !list.length ? <Empty>ยังไม่มีประกาศ — <Link href="/announcements">สร้างประกาศ</Link></Empty> : !rows.length ? <Empty>ไม่มีประกาศในหมวดนี้</Empty> : null}
      <div className="grid two">
        {rows.map((a) => {
          const st = stateOf(a);
          const [tone, text] = LABEL[st];
          const total = a.targets || 1;
          const pct = (n: number) => `${(n / total) * 100}%`;
          return (
            <section className={`card tcard ${st === 'deleted' ? 'deleted' : ''}`} key={a.id}>
              <div className="switchline"><h3>{a.title}{a.isTest && <small className="muted"> (ทดสอบ)</small>}</h3><span className={`ast ${tone}`}>{text}</span></div>
              <p className="sub">
                {fmtDate(a.createdAt)}{a.run > 1 && ` · รอบที่ ${a.run}`}
                {a.schedule && ` · ${a.schedule.cron ? `ทำซ้ำ ${a.schedule.cron}` : `ตั้งเวลา ${fmtDate(a.schedule.runAt)}`}${a.schedule.active ? '' : ' (หยุดไว้)'}`}
              </p>
              <div className="seg">
                {st === 'deleted' ? <i style={{ width: '100%', background: 'var(--t-grey)' }} /> : (
                  <>
                    <i style={{ width: pct(a.sent), background: 'var(--t-ok)' }} />
                    <i style={{ width: pct(a.failed), background: 'var(--t-bad)' }} />
                    <i style={{ width: pct(a.queued), background: 'var(--t-warn)' }} />
                  </>
                )}
              </div>
              <div className="switchline" style={{ marginTop: 8, alignItems: 'flex-end' }}>
                <small className="sub">
                  {st === 'deleted'
                    ? `ส่งสำเร็จ ${a.deleted}/${a.targets} ห้อง → ลบออกจาก Discord แล้ว ${a.deleted}/${a.targets} ห้อง`
                    : <>ส่งสำเร็จ <b>{a.sent}</b> จาก {a.targets} ห้อง{a.failed ? <> · ล้มเหลว <b style={{ color: '#fb7185' }}>{a.failed}</b></> : null}{a.queued ? <> · รอส่ง <b style={{ color: '#fbbf24' }}>{a.queued}</b></> : null}</>}
                </small>
                <strong className={`tpct ${tone}`}>{st === 'deleted' || st === 'idle' ? '—' : `${Math.round((a.sent / total) * 100)}%`}</strong>
              </div>
              <Link href={`/tracking/${a.id}`} style={{ display: 'inline-block', marginTop: 12 }}><button className="secondary small">ดูรายละเอียด →</button></Link>
            </section>
          );
        })}
      </div>
    </>
  );
}
