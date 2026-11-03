'use client';
import Link from 'next/link';
import { PageHead, Loading, ErrorBox, Empty } from '@/components/Shell';
import { useApi, useEvents, fmtDate, statusClass } from '@/lib/client';

type Row = { id: string; title: string; status: string; isTest: boolean; createdAt: string; targets: number; run: number; sent: number; failed: number; queued: number; schedule: { cron: string | null; runAt: string | null; active: boolean } | null };

export default function TrackingPage() {
  const { data, error, loading, reload } = useApi<{ announcements: Row[] }>('/api/announcements');
  useEvents((ev) => (ev.type === 'delivery' ? reload() : undefined));
  const totals = (data?.announcements ?? []).reduce((a, r) => ({ sent: a.sent + r.sent, queued: a.queued + r.queued, failed: a.failed + r.failed }), { sent: 0, queued: 0, failed: 0 });
  return (
    <>
      <PageHead crumb="TRACKING" title="Delivery Tracking" sub="ติดตามสถานะการส่งข้อความ (รอบล่าสุดของแต่ละประกาศ)" />
      <div className="grid three" style={{ marginBottom: 14 }}>
        {([['Sent', totals.sent, '#34d399'], ['Queued', totals.queued, '#fbbf24'], ['Failed', totals.failed, '#fb7185']] as const).map(([l, v, c]) => (
          <section className="card" key={l}><div className="statvalue" style={{ color: c }}>{v}</div><div className="statlabel">{l}</div></section>
        ))}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !data?.announcements.length ? <Empty>ยังไม่มีประกาศ — <Link href="/announcements">สร้างประกาศ</Link></Empty> : null}
      <div className="grid">
        {data?.announcements.map((a) => {
          const pct = a.targets ? Math.round((a.sent / a.targets) * 100) : 0;
          return (
            <section className="card" key={a.id}>
              <div className="switchline"><h3>{a.title}</h3><span className={`status ${statusClass(a.status)}`}>{a.status}</span></div>
              <p className="sub">
                {fmtDate(a.createdAt)} · run #{a.run || '—'}
                {a.schedule && ` · ${a.schedule.cron ? `cron ${a.schedule.cron}` : `at ${fmtDate(a.schedule.runAt)}`}${a.schedule.active ? '' : ' (paused)'}`}
              </p>
              <div className="bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="switchline" style={{ marginTop: 8 }}>
                <small className="sub">{a.sent} / {a.targets} sent · {a.failed} failed · {a.queued} queued</small>
                <strong>{pct}%</strong>
              </div>
              <Link href={`/tracking/${a.id}`} style={{ display: 'inline-block', marginTop: 10 }}><button className="secondary small">View Announcement</button></Link>
            </section>
          );
        })}
      </div>
    </>
  );
}
