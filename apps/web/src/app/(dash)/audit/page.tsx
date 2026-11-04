'use client';
import { useMemo, useState } from 'react';
import { PageHead, Loading, ErrorBox } from '@/components/Shell';
import { ActivityRow, CatChips, dayLabel, describe, type Cat } from '@/components/Activity';
import { useApi } from '@/lib/client';
import type { AuditRow } from '@/lib/types';

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const [who, setWho] = useState('');
  const [range, setRange] = useState<'all' | 'today' | '7'>('all');
  const { data, error, loading } = useApi<{ logs: AuditRow[] }>(`/api/audit${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  const logs = data?.logs ?? [];
  const people = useMemo(() => [...new Set(logs.map((l) => l.actorEmail ?? l.actor))], [logs]);
  const rows = logs.filter((l) => {
    if (cat !== 'all' && describe(l).cat !== cat) return false;
    if (who && (l.actorEmail ?? l.actor) !== who) return false;
    if (range !== 'all' && Date.now() - new Date(l.createdAt).getTime() > (range === 'today' ? 864e5 : 7 * 864e5)) return false;
    return true;
  });
  const today = logs.filter((l) => dayLabel(l.createdAt) === 'วันนี้');
  const nameOf = (e: string) => logs.find((l) => (l.actorEmail ?? l.actor) === e)?.actorName ?? e;

  function exportCsv() {
    const out = [['time', 'name', 'email', 'action', 'result', 'targets', 'detail'], ...rows.map((l) => [l.createdAt, l.actorName ?? '', l.actorEmail ?? l.actor, l.action, describe(l).label, JSON.stringify(l.targets), JSON.stringify(l.detail ?? {})])];
    const csv = '﻿' + out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'nexus-audit.csv';
    a.click();
  }

  let last = '';
  return (
    <>
      <PageHead crumb="AUDIT" title="Audit Logs" sub="ใครทำอะไร เมื่อไหร่ ผลเป็นอย่างไร" />
      <div className="grid stats" style={{ marginBottom: 14 }}>
        <section className="card"><div className="statvalue">{today.length}</div><div className="statlabel">กิจกรรมวันนี้</div></section>
        <section className="card"><div className="statvalue">{logs.filter((l) => l.action === 'announcement.create').length}</div><div className="statlabel">ประกาศที่ส่ง (200 รายการล่าสุด)</div></section>
        <section className="card"><div className="statvalue" style={{ color: '#fb7185' }}>{logs.filter((l) => ['bad', 'warn'].includes(describe(l).tone)).length}</div><div className="statlabel">ล้มเหลว / ต้องตรวจ</div></section>
        <section className="card"><div className="statvalue">{new Set(today.map((l) => l.actor)).size}</div><div className="statlabel">คนที่ active วันนี้</div></section>
      </div>
      <section className="card">
        <div className="toolbar">
          <input className="input grow" placeholder="ค้นหา ชื่อ, email, การกระทำ..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setQuery(q)} />
          <button className="secondary small" onClick={() => setQuery(q)}>ค้นหา</button>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 'auto' }}>
            <option value="">ทุกคน</option>
            {people.map((p) => <option key={p} value={p}>{p === 'system' ? 'ระบบอัตโนมัติ' : nameOf(p)}</option>)}
          </select>
          <select className="input" value={range} onChange={(e) => setRange(e.target.value as typeof range)} style={{ width: 'auto' }}>
            <option value="all">ทุกช่วงเวลา</option>
            <option value="today">24 ชั่วโมง</option>
            <option value="7">7 วัน</option>
          </select>
          <button className="secondary small" onClick={exportCsv}>↓ CSV</button>
        </div>
        <CatChips value={cat} onChange={setCat} />
        <ErrorBox error={error} />
        {loading && !data && <Loading />}
        {data && !rows.length && <p className="sub">ไม่พบรายการ</p>}
        {rows.map((l) => {
          const day = dayLabel(l.createdAt);
          const head = day !== last ? <div className="aday">{day}</div> : null;
          last = day;
          return (
            <div key={l.id}>
              {head}
              <ActivityRow row={l} showEmail />
            </div>
          );
        })}
      </section>
    </>
  );
}
