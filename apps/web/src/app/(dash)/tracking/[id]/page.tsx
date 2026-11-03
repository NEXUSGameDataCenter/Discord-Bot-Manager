'use client';
import { use, useState } from 'react';
import { PageHead, Loading, ErrorBox, useToast } from '@/components/Shell';
import { api, useApi, useEvents, fmtDate, statusClass } from '@/lib/client';

type Detail = {
  announcement: { id: string; title: string; status: string; createdAt: string; payload: { content: string }; isTest: boolean };
  run: number;
  targets: { id: string; guildName: string; channelName: string; mode: string; status: string; error: string | null; attempts: number; sentAt: string | null; jumpUrl: string | null }[];
  sentTotal: number;
};

export default function TrackingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data, error, reload } = useApi<Detail>(`/api/announcements/${id}`);
  const [filter, setFilter] = useState<'all' | 'SENT' | 'FAILED' | 'QUEUED'>('all');
  const [editText, setEditText] = useState<string | null>(null);
  useEvents((ev) => (ev.type === 'delivery' && ev.announcementId === id ? reload() : undefined));
  if (!data) return <><PageHead crumb="TRACKING" title="Delivery Tracking" sub="" /><ErrorBox error={error} /><Loading /></>;

  const failed = data.targets.filter((t) => t.status === 'FAILED').length;
  const rows = data.targets.filter((t) => filter === 'all' || t.status === filter);

  async function retry() {
    try {
      const r = await api<{ queued: number }>(`/api/announcements/${id}/retry`, { body: {} });
      toast(`Retry failed-only jobs queued · ${r.queued} targets`);
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function editEverywhere() {
    if (editText === null) return;
    if (!confirm(`แก้ไขข้อความ (content) ใน ${data!.sentTotal} ข้อความที่ส่งไปแล้ว?\n(embed/ไฟล์แนบจะคงเดิม และจะไม่ ping ซ้ำ)`)) return;
    try {
      await api(`/api/announcements/${id}`, { method: 'PATCH', body: { content: editText, confirmCount: data!.sentTotal } });
      toast('Edit-everywhere queued');
      setEditText(null);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function deleteEverywhere() {
    const typed = prompt(`ลบประกาศนี้ออกจากทุกที่: ${data!.sentTotal} ข้อความ และยกเลิก schedule (ถ้ามี)\nพิมพ์จำนวน ${data!.sentTotal} เพื่อยืนยัน:`);
    if (typed === null) return;
    if (Number(typed) !== data!.sentTotal) return toast('จำนวนไม่ตรง ยกเลิกการลบ', true);
    try {
      await api(`/api/announcements/${id}`, { method: 'DELETE', body: { confirmCount: data!.sentTotal } });
      toast('Delete-everywhere queued');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <>
      <PageHead crumb="TRACKING" title={data.announcement.title} sub={`${fmtDate(data.announcement.createdAt)} · run #${data.run || '—'}`} action={<span className={`status ${statusClass(data.announcement.status)}`}>{data.announcement.status}</span>} />
      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['all', 'SENT', 'FAILED', 'QUEUED'] as const).map((f) => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f[0] + f.slice(1).toLowerCase()}</button>
        ))}
      </div>
      <section className="card">
        {!rows.length && <p className="sub">ไม่มีรายการ</p>}
        {rows.map((t) => (
          <div className="deliveryrow" key={t.id}>
            <div className="grow">
              <strong>{t.guildName} · #{t.channelName}</strong>
              <small>{t.status === 'SENT' ? `${fmtDate(t.sentAt)} · ${t.mode}` : (t.error ?? (t.status === 'QUEUED' ? `Waiting · attempt ${t.attempts}` : t.status))}</small>
            </div>
            <span className={`status ${statusClass(t.status)}`}>{t.status}</span>
            {t.jumpUrl && <a href={t.jumpUrl} target="_blank" rel="noreferrer"><button className="ghost small" title="Jump to message">↗</button></a>}
          </div>
        ))}
      </section>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button disabled={!failed} onClick={retry}>↻ Retry Failed Only ({failed})</button>
        <button className="secondary" disabled={!data.sentTotal} onClick={() => setEditText(data.announcement.payload.content ?? '')}>✎ Edit everywhere</button>
        <button className="danger" disabled={!data.sentTotal} onClick={deleteEverywhere}>Delete everywhere ({data.sentTotal})</button>
      </div>
      {editText !== null && (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>Edit content in {data.sentTotal} messages</h3>
          <textarea maxLength={2000} value={editText} onChange={(e) => setEditText(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={editEverywhere}>Apply edit</button>
            <button className="ghost" onClick={() => setEditText(null)}>Cancel</button>
          </div>
        </section>
      )}
    </>
  );
}
