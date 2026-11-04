'use client';
import { useState } from 'react';
import { ROLE_LABEL, type TeamRole } from '@nexus/shared';
import { PageHead, Loading, ErrorBox, useToast, useMe } from '@/components/Shell';
import { api, useApi, fmtDate } from '@/lib/client';

type Member = {
  id: string; email: string; name: string | null; avatarAssetId: string | null; role: TeamRole;
  status: 'PENDING' | 'INVITED' | 'ACTIVE' | 'DISABLED'; lastLogin: string | null; createdAt: string; invitedBy: string | null; requestNote: string | null;
};
const STATUS: Record<Member['status'], [string, string]> = { PENDING: ['รออนุมัติ', 'warning'], INVITED: ['รอรับคำเชิญ', 'info'], ACTIVE: ['ใช้งาน', 'success'], DISABLED: ['ปิดใช้งาน', 'failed'] };

export default function TeamPage() {
  const toast = useToast();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const { data, error, reload } = useApi<{ members: Member[] }>('/api/team');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EDITOR'>('EDITOR');
  const [approveRole, setApproveRole] = useState<Record<string, 'ADMIN' | 'EDITOR'>>({});
  const [link, setLink] = useState<{ email: string; inviteUrl: string } | null>(null);

  const pending = data?.members.filter((m) => m.status === 'PENDING') ?? [];
  const members = data?.members.filter((m) => m.status !== 'PENDING') ?? [];
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  async function invite() {
    try {
      const r = await api<{ inviteUrl: string }>('/api/team', { body: { email, role } });
      setLink({ email: email.trim().toLowerCase(), inviteUrl: r.inviteUrl });
      setEmail('');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function newLink(m: Member) {
    try {
      const r = await api<{ inviteUrl: string }>(`/api/team/${m.id}/invite`, { body: {} });
      setLink({ email: m.email, inviteUrl: r.inviteUrl });
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast('คัดลอกลิงก์แล้ว');
    } catch {
      toast('คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง', true);
    }
  }
  const avatar = (m: Member) => (
    <div className="boticon" style={{ borderRadius: '50%', overflow: 'hidden' }}>{m.avatarAssetId ? <img src={`/api/assets/${m.avatarAssetId}`} alt="" /> : (m.name ?? m.email)[0]?.toUpperCase()}</div>
  );

  return (
    <>
      <PageHead crumb="TEAM" title="Team" sub="คนที่เข้าใช้ Dashboard ได้" />
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <>
          {isOwner && pending.length > 0 && (
            <section className="card" style={{ marginBottom: 14, borderColor: '#6b5a2a' }}>
              <h3>คำขอเข้าร่วม ({pending.length})</h3>
              {pending.map((m) => (
                <div className="botrow" key={m.id}>
                  {avatar(m)}
                  <div className="grow">
                    <strong>{m.name ?? m.email}</strong>
                    <small>{m.email} · ขอเมื่อ {fmtDate(m.createdAt)}</small>
                    {m.requestNote && <small>“{m.requestNote}”</small>}
                  </div>
                  <select style={{ width: 'auto' }} aria-label="Role" value={approveRole[m.id] ?? 'EDITOR'} onChange={(e) => setApproveRole({ ...approveRole, [m.id]: e.target.value as 'ADMIN' | 'EDITOR' })}>
                    <option value="EDITOR">Editor</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button className="small" onClick={() => run(() => api(`/api/team/${m.id}/approve`, { body: { role: approveRole[m.id] ?? 'EDITOR' } }), `อนุมัติ ${m.email} แล้ว`)}>อนุมัติ</button>
                  <button className="danger small" onClick={() => confirm(`ปฏิเสธคำขอของ ${m.email}?`) && run(() => api(`/api/team/${m.id}/approve`, { method: 'DELETE' }), 'ปฏิเสธคำขอแล้ว')}>ปฏิเสธ</button>
                </div>
              ))}
            </section>
          )}

          <section className="card">
            <div className="switchline"><h3>สมาชิก ({members.length})</h3></div>
            {members.map((m) => {
              const editable = isOwner && m.role !== 'OWNER' && m.email !== me.email;
              return (
                <div className="botrow" key={m.id}>
                  {avatar(m)}
                  <div className="grow">
                    <strong>{m.name ?? m.email.split('@')[0]}{m.email === me.email ? ' (คุณ)' : ''}</strong>
                    <small>{m.email}{m.lastLogin ? ` · เข้าล่าสุด ${fmtDate(m.lastLogin)}` : ''}</small>
                  </div>
                  {editable ? (
                    <select style={{ width: 'auto' }} value={m.role} aria-label="Role" onChange={(e) => run(() => api(`/api/team/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'เปลี่ยนสิทธิ์แล้ว')}>
                      <option value="ADMIN">Admin</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  ) : (
                    <span className="status info">{m.role}</span>
                  )}
                  <span className={`status ${STATUS[m.status][1]}`}>{STATUS[m.status][0]}</span>
                  {editable && (
                    <details className="more menu">
                      <summary aria-label="More">⋯</summary>
                      <div className="menupanel">
                        {m.status === 'INVITED' && <button className="secondary small" onClick={() => newLink(m)}>ลิงก์เชิญใหม่</button>}
                        <button className="secondary small" onClick={() => run(() => api(`/api/team/${m.id}`, { method: 'PATCH', body: { status: m.status === 'DISABLED' ? 'ENABLED' : 'DISABLED' } }), 'อัปเดตแล้ว')}>
                          {m.status === 'DISABLED' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </button>
                        <button className="danger small" onClick={() => confirm(`ลบ ${m.email} ออกจากทีม?`) && run(() => api(`/api/team/${m.id}`, { method: 'DELETE' }), 'ลบออกจากทีมแล้ว')}>ลบออก</button>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </section>

          {isOwner && (
            <details className="more card" style={{ marginTop: 14 }}>
              <summary>+ เชิญด้วยลิงก์ (แทนการรอคำขอ)</summary>
              <p className="sub">สร้างลิงก์ใช้ครั้งเดียว อายุ 7 วัน แล้วส่งให้เขาเองทาง Discord · เขาจะตั้งชื่อและรหัสผ่านเองตอนเปิดลิงก์</p>
              <div className="inline">
                <input className="input" id="invite-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'EDITOR')}>
                  <option value="EDITOR">Editor</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button disabled={!email.includes('@')} onClick={invite}>สร้างลิงก์เชิญ</button>
              </div>
            </details>
          )}
          {link && (
            <div className="notice ok-notice" style={{ marginTop: 10 }}>
              <div>ลิงก์เชิญของ <b>{link.email}</b> — ใช้ได้ครั้งเดียว หมดอายุใน 7 วัน</div>
              <div className="row" style={{ marginTop: 6 }}>
                <input className="input grow" readOnly value={link.inviteUrl} onFocus={(e) => e.target.select()} />
                <button className="secondary small" onClick={() => copy(link.inviteUrl)}>Copy</button>
              </div>
            </div>
          )}
          <details className="more" style={{ marginTop: 14 }}>
            <summary>สิทธิ์แต่ละระดับ</summary>
            {(['OWNER', 'ADMIN', 'EDITOR'] as const).map((r) => (
              <div className="switchline" key={r} style={{ padding: '6px 0' }}><span className="status info">{r}</span><small className="muted" style={{ textAlign: 'right' }}>{ROLE_LABEL[r].split(' — ')[1]}</small></div>
            ))}
          </details>
        </>
      )}
    </>
  );
}
