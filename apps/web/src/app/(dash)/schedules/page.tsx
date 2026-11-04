'use client';
import Link from 'next/link';
import { PageHead, Loading, ErrorBox, Empty, useToast } from '@/components/Shell';
import { api, useApi, fmtDate } from '@/lib/client';
import { NavIcon } from '@/components/NavIcon';

type S = { id: string; cron: string | null; runAt: string | null; timezone: string; active: boolean; lastRunAt: string | null; announcement: { id: string; title: string; status: string; _count: { targets: number } } };

export default function SchedulesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ schedules: S[] }>('/api/schedules');
  async function toggle(s: S) {
    try {
      await api(`/api/schedules/${s.id}`, { method: 'PATCH', body: { active: !s.active } });
      toast(s.active ? 'Paused' : 'Resumed');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function del(s: S) {
    if (!confirm(`ลบ schedule ของ "${s.announcement.title}"? (${s.announcement._count.targets} channels จะไม่ได้รับรอบถัดไป · ข้อความที่ส่งไปแล้วไม่ถูกลบ)`)) return;
    try {
      await api(`/api/schedules/${s.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHead crumb="SCHEDULES" title="Schedules" />
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !data?.schedules.length ? <Empty>ยังไม่มี Schedule</Empty> : null}
      <div className="grid">
        {data?.schedules.map((s) => (
          <section className="card" key={s.id}>
            <div className="botrow" style={{ paddingTop: 0 }}>
              <div className="boticon"><NavIcon name="clock" /></div>
              <div className="grow">
                <strong>{s.announcement.title}</strong>
                <small>{s.cron ? `cron ${s.cron}` : `once at ${fmtDate(s.runAt)}`} · {s.timezone} · {s.announcement._count.targets} channels · last run {fmtDate(s.lastRunAt)}</small>
              </div>
              <span className={`status ${s.active ? 'success' : 'warning'}`}>{s.active ? 'Active' : 'Paused'}</span>
            </div>
            <div className="toolbar">
              <Link href={`/tracking/${s.announcement.id}`}><button className="secondary small">View deliveries</button></Link>
              <button className="secondary small" onClick={() => toggle(s)}>{s.active ? 'Pause' : 'Resume'}</button>
              <button className="danger small" onClick={() => del(s)}>Delete</button>
            </div>
          </section>
        ))}
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>Timezone Configuration</h3>
        <span className="status info">Asia/Bangkok · UTC+7</span>
        <p className="sub">ระบบ Schedule ใช้เวลา Asia/Bangkok เป็นค่าเริ่มต้น</p>
      </section>
    </>
  );
}
