'use client';
import { useState } from 'react';
import { PageHead, Loading, ErrorBox } from '@/components/Shell';
import { useApi, fmtDate, statusClass } from '@/lib/client';
import type { AuditRow } from '@/lib/types';

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, loading } = useApi<{ logs: AuditRow[] }>(`/api/audit${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  function exportCsv() {
    const rows = [['time', 'actor', 'action', 'targets', 'result'], ...(data?.logs ?? []).map((l) => [l.createdAt, l.actor, l.action, JSON.stringify(l.targets), l.result])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'nexus-audit.csv';
    a.click();
  }
  return (
    <>
      <PageHead crumb="AUDIT" title="Audit Logs" sub="ประวัติการดำเนินการทั้งหมด" />
      <section className="card">
        <div className="toolbar">
          <input className="input grow" placeholder="Search actions, users or results..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setQuery(q)} />
          <button className="secondary small" onClick={() => setQuery(q)}>Search</button>
          <button className="secondary small" onClick={exportCsv}>↓ Export CSV</button>
        </div>
        <ErrorBox error={error} />
        {loading && !data && <Loading />}
        {data?.logs.map((l) => (
          <div className="activityrow" key={l.id}>
            <div className="grow">
              <strong>{l.action}</strong>
              <small>{l.actor} · {Object.entries(l.targets ?? {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</small>
            </div>
            <small className="muted">{fmtDate(l.createdAt)}</small>
            <span className={`status ${statusClass(l.result)}`}>{l.result}</span>
          </div>
        ))}
      </section>
    </>
  );
}
