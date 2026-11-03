'use client';
import { useState } from 'react';
import { ROLE_LABEL, type TeamRole } from '@nexus/shared';
import { PageHead, Loading, ErrorBox, useToast, useMe } from '@/components/Shell';
import { api, useApi, fmtDate, statusClass } from '@/lib/client';

type Member = { id: string; email: string; name: string | null; avatarAssetId: string | null; role: TeamRole; status: 'INVITED' | 'ACTIVE' | 'DISABLED'; lastLogin: string | null; createdAt: string; invitedBy: string | null };
type InviteResult = { inviteUrl: string; emailed: boolean; emailError?: string };

export default function TeamPage() {
  const toast = useToast();
  const me = useMe();
  const isOwner = me.role === 'OWNER';
  const { data, error, reload } = useApi<{ members: Member[] }>('/api/team');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'EDITOR'>('EDITOR');
  const [link, setLink] = useState<(InviteResult & { email: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite() {
    setBusy(true);
    try {
      const r = await api<InviteResult>('/api/team', { body: { email, role } });
      setLink({ ...r, email: email.trim().toLowerCase() });
      toast(r.emailed ? `ส่งคำเชิญไปที่ ${email} แล้ว` : 'สร้างคำเชิญแล้ว แต่ส่งอีเมลไม่สำเร็จ — คัดลอกลิงก์ส่งเองได้', !r.emailed);
      setEmail('');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function resend(m: Member) {
    try {
      const r = await api<InviteResult>(`/api/team/${m.id}/invite`, { body: {} });
      setLink({ ...r, email: m.email });
      toast(r.emailed ? 'ส่งคำเชิญอีกครั้งแล้ว' : 'ส่งอีเมลไม่สำเร็จ — คัดลอกลิงก์ส่งเองได้', !r.emailed);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function patch(m: Member, body: { role?: string; status?: string }) {
    try {
      await api(`/api/team/${m.id}`, { method: 'PATCH', body });
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function remove(m: Member) {
    if (!confirm(`ลบ ${m.email} ออกจากทีม? เขาจะเข้าสู่ระบบไม่ได้ทันที`)) return;
    try {
      await api(`/api/team/${m.id}`, { method: 'DELETE' });
      toast('ลบออกจากทีมแล้ว');
      reload();
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

  return (
    <>
      <PageHead crumb="TEAM" title="Team" sub="คนที่เข้าใช้ Dashboard ได้ · เข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญเท่านั้น" />
      {isOwner && (
        <section className="card" style={{ marginBottom: 14 }}>
          <h3>＋ Invite</h3>
          <div className="inline">
            <input className="input" id="invite-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'EDITOR')}>
              <option value="EDITOR">Editor</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button disabled={busy || !email.includes('@')} onClick={invite}>{busy ? 'Sending…' : 'Send invite'}</button>
          </div>
          <small className="sub">{ROLE_LABEL[role]}</small>
          {link && (
            <div className="notice" style={{ background: '#202d53', color: '#c7d2fe', marginTop: 10 }}>
              <div>ลิงก์คำเชิญของ <b>{link.email}</b> (ใช้ได้ครั้งเดียว หมดอายุใน 7 วัน){link.emailed ? ' · ส่งทางอีเมลแล้ว' : ` · ส่งอีเมลไม่ได้: ${link.emailError ?? ''}`}</div>
              <div className="row" style={{ marginTop: 6 }}>
                <input className="input grow" readOnly value={link.inviteUrl} onFocus={(e) => e.target.select()} />
                <button className="secondary small" onClick={() => copy(link.inviteUrl)}>Copy</button>
              </div>
            </div>
          )}
        </section>
      )}
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <section className="card">
          {data.members.map((m) => (
            <div className="botrow" key={m.id}>
              <div className="boticon" style={{ borderRadius: '50%', overflow: 'hidden' }}>{m.avatarAssetId ? <img src={`/api/assets/${m.avatarAssetId}`} alt="" /> : '♙'}</div>
              <div className="grow">
                <strong>{m.name ?? m.email.split('@')[0]}{m.email === me.email ? ' (คุณ)' : ''}</strong>
                <small>{m.email} · {m.status === 'INVITED' ? `เชิญเมื่อ ${fmtDate(m.createdAt)}` : `เข้าล่าสุด ${fmtDate(m.lastLogin)}`}</small>
              </div>
              {isOwner && m.role !== 'OWNER' && m.email !== me.email ? (
                <select style={{ width: 'auto' }} value={m.role} onChange={(e) => patch(m, { role: e.target.value })} aria-label="Role">
                  <option value="ADMIN">Admin</option>
                  <option value="EDITOR">Editor</option>
                </select>
              ) : (
                <span className="status info">{m.role}</span>
              )}
              <span className={`status ${m.status === 'ACTIVE' ? 'success' : m.status === 'INVITED' ? 'warning' : statusClass('FAILED')}`}>{m.status}</span>
              {isOwner && m.role !== 'OWNER' && m.email !== me.email && (
                <div className="row">
                  {m.status === 'INVITED' && <button className="secondary small" onClick={() => resend(m)}>Resend</button>}
                  <button className="secondary small" onClick={() => patch(m, { status: m.status === 'DISABLED' ? 'ENABLED' : 'DISABLED' })}>{m.status === 'DISABLED' ? 'Enable' : 'Disable'}</button>
                  <button className="danger small" onClick={() => remove(m)}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="card" style={{ marginTop: 14 }}>
        <h3>สิทธิ์แต่ละระดับ</h3>
        {(['OWNER', 'ADMIN', 'EDITOR'] as const).map((r) => <div className="switchline" key={r} style={{ padding: '6px 0' }}><span className="status info">{r}</span><small className="muted" style={{ textAlign: 'right' }}>{ROLE_LABEL[r].split(' — ')[1]}</small></div>)}
      </section>
    </>
  );
}
