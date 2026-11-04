'use client';
import Link from 'next/link';
import { PageHead, Loading, ErrorBox } from '@/components/Shell';
import { useApi, useEvents, statusClass } from '@/lib/client';
import type { AuditRow } from '@/lib/types';
import { ActivityRow, CatChips, describe, type Cat } from '@/components/Activity';
import { useState } from 'react';

type Overview = {
  bots: { id: string; username: string; status: string; pingMs: number | null; guilds: number }[];
  guilds: number;
  sent30: number;
  failed7: number;
  activity: { day: string; count: number }[];
  recent: AuditRow[];
};

export default function OverviewPage() {
  const { data, error, reload } = useApi<Overview>('/api/overview');
  useEvents((ev) => (ev.type === 'bot' && ev.status !== 'ONLINE') || ev.type === 'guilds' ? reload() : undefined);
  const max = Math.max(1, ...(data?.activity.map((a) => a.count) ?? [1]));
  return (
    <>
      <PageHead crumb="OVERVIEW" title="ภาพรวมระบบ" />
      <ErrorBox error={error} />
      {!data ? (
        <Loading rows={4} />
      ) : (
        <>
          <div className="grid stats">
            {[
              ['Active Bots', `${data.bots.filter((b) => b.status === 'ONLINE').length}/${data.bots.length}`, 'Online / total', '♟'],
              ['Connected Servers', data.guilds.toLocaleString(), 'Across all bots', '▤'],
              ['Messages Delivered', data.sent30.toLocaleString(), 'Last 30 days', '➤'],
              ['Failed Deliveries', data.failed7.toLocaleString(), data.failed7 ? 'Requires attention' : 'Last 7 days', '⚠'],
            ].map(([l, v, s, i]) => (
              <section className="card glow" key={l}>
                <span className="staticon">{i}</span>
                <div className="statlabel">{l}</div>
                <div className="statvalue value">{v}</div>
                <div className="sub">{s}</div>
              </section>
            ))}
          </div>
          <div className="grid two">
            <div className="grid">
              <section className="card">
                <div className="switchline">
                  <h3>Bot Health Monitor</h3>
                  <span className="status success">LIVE STATUS</span>
                </div>
                {!data.bots.length && <p className="sub">ยังไม่มี Bot — <Link href="/bots">เพิ่ม Bot</Link></p>}
                {data.bots.map((b) => (
                  <div className="botrow" key={b.id}>
                    <div className="boticon">♟</div>
                    <div className="grow">
                      <strong>{b.username}</strong>
                      <small>{b.guilds} Servers · {b.pingMs ?? '—'} ms ping</small>
                    </div>
                    <span className={`status ${statusClass(b.status)}`}>{b.status}</span>
                  </div>
                ))}
                <Link href="/bots"><button className="secondary">Manage all bots →</button></Link>
              </section>
              <section className="card">
                <h3>Announcement Activity</h3>
                <div className="sub">Last 7 days (Asia/Bangkok)</div>
                <div className="chart">
                  {data.activity.map((a) => (
                    <div className="chartcol" key={a.day} title={`${a.day}: ${a.count}`}>
                      <i style={{ height: `${Math.max(3, (a.count / max) * 100)}%` }} />
                      <small>{a.day.slice(5)}</small>
                    </div>
                  ))}
                </div>
                <div className="switchline">
                  <span className="sub">Total deliveries</span>
                  <strong style={{ fontSize: 22 }}>{data.activity.reduce((n, a) => n + a.count, 0).toLocaleString()}</strong>
                </div>
              </section>
            </div>
            <div className="grid">
              <RecentActivity rows={data.recent} />
              <section className="card">
                <h3>Quick Actions</h3>
                <div className="grid">
                  <Link href="/announcements"><button style={{ width: '100%' }}>＋ Create Announcement</button></Link>
                  <Link href="/servers"><button className="secondary" style={{ width: '100%' }}>▤ Manage Servers</button></Link>
                  <Link href="/bots"><button className="secondary" style={{ width: '100%' }}>♟ Manage Bots</button></Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function RecentActivity({ rows }: { rows: AuditRow[] }) {
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const list = rows.filter((r) => cat === 'all' || describe(r).cat === cat);
  return (
    <section className="card">
      <div className="switchline">
        <h3>Recent Activity</h3>
        <Link href="/audit" style={{ fontSize: 12.5 }}>ดูทั้งหมด →</Link>
      </div>
      <CatChips value={cat} onChange={setCat} />
      {!list.length && <p className="sub">ยังไม่มีกิจกรรม</p>}
      {list.map((r) => <ActivityRow key={r.id} row={r} />)}
    </section>
  );
}
