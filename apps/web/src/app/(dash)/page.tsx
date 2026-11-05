'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHead, Loading, ErrorBox } from '@/components/Shell';
import { ActivityRow, CatChips, describe, type Cat } from '@/components/Activity';
import { NavIcon } from '@/components/NavIcon';
import { useApi, useEvents, fmtDate } from '@/lib/client';
import type { AuditRow } from '@/lib/types';

type Overview = {
  bots: { id: string; username: string; avatarUrl: string | null; status: string; pingMs: number | null; guilds: number }[];
  guilds: number;
  sent30: number;
  failed7: number;
  activity: { day: string; count: number }[];
  recent: AuditRow[];
};
type AnnRow = { id: string; title: string; isTest: boolean; createdAt: string };
type Detail = {
  announcement: { id: string; title: string; createdAt: string; allowEveryone: boolean };
  targets: { id: string; guildName: string; channelName: string; status: string; skip: boolean }[];
};

const BOT_STATUS: Record<string, string> = { ONLINE: 'ออนไลน์', OFFLINE: 'ออฟไลน์', STARTING: 'กำลังเชื่อมต่อ', ERROR: 'ผิดพลาด' };
const level = (ms: number | null) => (ms === null ? 0 : ms < 300 ? 3 : ms < 600 ? 2 : 1);
const Sig = ({ ms }: { ms: number | null }) => <span className={`sig l${level(ms)}`}><i /><i /><i /></span>;

export default function OverviewPage() {
  const { data, error, reload } = useApi<Overview>('/api/overview');
  useEvents((ev) => (ev.type === 'bot' && ev.status !== 'ONLINE') || ev.type === 'guilds' ? reload() : undefined);
  const today = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date());
  return (
    <>
      <PageHead
        crumb="OVERVIEW"
        title="ภาพรวมระบบ"
        sub={today}
        action={<div className="toolbar" style={{ margin: 0 }}><Link href="/audit"><button className="secondary">Audit logs</button></Link><Link href="/announcements"><button>+ สร้างประกาศ</button></Link></div>}
      />
      <ErrorBox error={error} />
      {!data ? (
        <Loading rows={4} />
      ) : (
        <>
          <div className="grid stats">
            <Stat label="Bots ออนไลน์" value={`${data.bots.filter((b) => b.status === 'ONLINE').length}/${data.bots.length}`} note={avgPing(data.bots)} />
            <Stat label="Servers ที่เชื่อม" value={data.guilds.toLocaleString()} note={`จาก ${data.bots.length} bots`} />
            <Stat label="ข้อความที่ส่ง · 30 วัน" value={data.sent30.toLocaleString()} note={`7 วันล่าสุด ${data.activity.reduce((n, a) => n + a.count, 0).toLocaleString()}`} />
            <Stat label="ส่งล้มเหลว · 7 วัน" value={data.failed7.toLocaleString()} note={data.failed7 ? <Link href="/tracking">ดูห้องที่ล้มเหลว</Link> : 'ไม่มีปัญหา'} bad={data.failed7 > 0} />
          </div>
          <div className="grid two" style={{ marginBottom: 12 }}>
            <LatestBroadcast />
            <section className="card">
              <div className="switchline" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Bots</h3><span className="sub">อัปเดตสด</span></div>
              {!data.bots.length && <p className="sub">ยังไม่มี Bot — <Link href="/bots">เพิ่ม Bot</Link></p>}
              {data.bots.map((b) => (
                <div className="botrow" key={b.id}>
                  <div className="boticon" style={{ overflow: 'hidden', borderRadius: '50%' }}>{b.avatarUrl ? <img src={b.avatarUrl} alt="" /> : <NavIcon name="bot" />}</div>
                  <div className="grow"><strong>{b.username}</strong><small>{b.guilds} servers · {BOT_STATUS[b.status] ?? b.status}</small></div>
                  <span className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--t2)' }}><Sig ms={b.status === 'ONLINE' ? b.pingMs : null} />{b.pingMs !== null && b.status === 'ONLINE' ? `${b.pingMs} ms` : '—'}</span>
                </div>
              ))}
              <div className="switchline" style={{ margin: '20px 0 8px' }}><h3 style={{ margin: 0 }}>ข้อความที่ส่ง · 7 วัน</h3><span className="sub mono">รวม {data.activity.reduce((n, a) => n + a.count, 0).toLocaleString()}</span></div>
              <WeekChart days={data.activity} />
            </section>
          </div>
          <RecentActivity rows={data.recent} />
        </>
      )}
    </>
  );
}

function avgPing(bots: Overview['bots']) {
  const p = bots.filter((b) => b.status === 'ONLINE' && b.pingMs !== null).map((b) => b.pingMs!);
  return p.length ? <>ping เฉลี่ย <span className="mono">{Math.round(p.reduce((a, b) => a + b, 0) / p.length)} ms</span></> : 'ไม่มี bot ออนไลน์';
}

function Stat({ label, value, note, bad }: { label: string; value: string; note: React.ReactNode; bad?: boolean }) {
  return (
    <section className="card">
      <div className="statlabel">{label}</div>
      <div className="statvalue" style={bad ? { color: 'var(--red)' } : undefined}>{value}</div>
      <div className="sub">{note}</div>
    </section>
  );
}

/** The latest real announcement, drawn as servers × channels so the fan-out reads at a glance. */
function LatestBroadcast() {
  const list = useApi<{ announcements: AnnRow[] }>('/api/announcements');
  const latest = list.data?.announcements.find((a) => !a.isTest);
  const det = useApi<Detail>(latest ? `/api/announcements/${latest.id}` : null);
  useEvents((ev) => (ev.type === 'delivery' && ev.announcementId === latest?.id ? det.reload() : undefined));
  const targets = (det.data?.targets ?? []).filter((t) => !t.skip);
  const byGuild = new Map<string, typeof targets>();
  for (const t of targets) byGuild.set(t.guildName, [...(byGuild.get(t.guildName) ?? []), t]);
  const n = (s: string) => targets.filter((t) => t.status === s).length;
  return (
    <section className="card">
      <div className="switchline" style={{ marginBottom: 12 }}><h3 style={{ margin: 0 }}>ประกาศล่าสุด</h3>{latest && <Link href={`/tracking/${latest.id}`} style={{ fontSize: 13, color: 'var(--t2)' }}>ดูผลการส่ง</Link>}</div>
      {list.data && !latest && <p className="sub">ยังไม่มีประกาศ — <Link href="/announcements">สร้างประกาศ</Link></p>}
      {latest && !det.data && <Loading rows={2} />}
      {det.data && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontWeight: 500, fontSize: 16 }}>{det.data.announcement.title}</b>
            {det.data.announcement.allowEveryone && <span className="tag">@everyone</span>}
          </div>
          <div className="sub" style={{ margin: '4px 0 20px' }}>{fmtDate(det.data.announcement.createdAt)} · {byGuild.size} servers, {targets.length} ห้อง</div>
          {[...byGuild].map(([g, ts]) => (
            <div className="bcrow" key={g}>
              <span className="n" title={g}>{g}</span>
              <span className="chs">{ts.map((t) => <span key={t.id} className={`chn ${t.status}`} title={t.status}>#{t.channelName}</span>)}</span>
              <span className="r">{ts.filter((t) => t.status === 'SENT').length}/{ts.length}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="ast ok">ส่งแล้ว {n('SENT')}</span>
            {n('FAILED') > 0 && <span className="ast bad">ล้มเหลว {n('FAILED')}</span>}
            {n('QUEUED') > 0 && <span className="ast grey">รอส่ง {n('QUEUED')}</span>}
            {n('DELETED') > 0 && <span className="ast grey">ลบแล้ว {n('DELETED')}</span>}
            <span style={{ flex: 1 }} />
            {n('FAILED') > 0 && latest && <Link href={`/tracking/${latest.id}`} style={{ fontSize: 13 }}>ส่งซ้ำห้องที่ล้มเหลว</Link>}
          </div>
        </>
      )}
    </section>
  );
}

function WeekChart({ days }: { days: { day: string; count: number }[] }) {
  const max = Math.max(4, ...days.map((d) => d.count));
  const X = (i: number) => 24 + i * (336 / Math.max(1, days.length - 1));
  const Y = (v: number) => 170 - (v / max) * 150;
  const path = days.map((d, i) => (i ? `C${X(i - 1) + 28},${Y(days[i - 1]!.count)} ${X(i) - 28},${Y(d.count)} ${X(i)},${Y(d.count)}` : `M${X(0)},${Y(d.count)}`)).join('');
  const last = days[days.length - 1];
  return (
    <svg viewBox="0 0 370 200" style={{ width: '100%', height: 200, overflow: 'visible' }} role="img" aria-label="ข้อความที่ส่ง 7 วัน">
      {[0, Math.round(max / 2), max].map((v) => (
        <g key={v}><line x1="24" x2="360" y1={Y(v)} y2={Y(v)} stroke="rgba(232,236,241,.07)" /><text x="0" y={Y(v) + 4} style={{ font: '400 11px var(--mono)', fill: 'var(--muted)' }}>{v}</text></g>
      ))}
      {days.map((d, i) => <text key={d.day} x={X(i)} y="194" textAnchor="middle" style={{ font: '400 11px var(--mono)', fill: 'var(--muted)' }}>{d.day.slice(8)}/{d.day.slice(5, 7)}</text>)}
      {days.length > 1 && <path d={`${path}L${X(days.length - 1)},170L${X(0)},170Z`} fill="rgba(76,201,224,.08)" />}
      {days.length > 1 && <path d={path} fill="none" stroke="#4cc9e0" strokeWidth="2" />}
      {last && <circle cx={X(days.length - 1)} cy={Y(last.count)} r="3.5" fill="#4cc9e0" />}
    </svg>
  );
}

function RecentActivity({ rows }: { rows: AuditRow[] }) {
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const list = rows.filter((r) => cat === 'all' || describe(r).cat === cat);
  return (
    <section className="card">
      <div className="switchline" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>กิจกรรมล่าสุด</h3>
        <Link href="/audit" style={{ fontSize: 13, color: 'var(--t2)' }}>ดูทั้งหมด</Link>
      </div>
      <CatChips value={cat} onChange={setCat} />
      {!list.length && <p className="sub">ยังไม่มีกิจกรรม</p>}
      {list.map((r) => <ActivityRow key={r.id} row={r} />)}
    </section>
  );
}
