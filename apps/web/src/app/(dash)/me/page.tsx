'use client';
import { useState } from 'react';
import { PageHead, useToast, useMe } from '@/components/Shell';
import { ImageCropper } from '@/components/ImageCropper';
import { api, useApi } from '@/lib/client';
import { NotifySettings } from '@/components/NotifySettings';

export default function MePage() {
  const toast = useToast();
  const me = useMe();
  const [name, setName] = useState(me.name);
  const [avatarAssetId, setAvatar] = useState<string | null>(me.avatarAssetId);
  const [saving, setSaving] = useState(false);
  const pw = useApi<{ me: { hasPassword: boolean } }>('/api/me');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  async function changePassword() {
    if (next !== confirmPw) return toast('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน', true);
    try {
      await api('/api/me/password', { method: 'PUT', body: { current: current || undefined, next } });
      toast('เปลี่ยนรหัสผ่านแล้ว');
      setCurrent(''); setNext(''); setConfirmPw('');
      pw.reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api('/api/me', { method: 'PUT', body: { name: name.trim() || null, avatarAssetId } });
      toast('บันทึกโปรไฟล์แล้ว');
      window.location.reload(); // refresh the sidebar, which is rendered on the server
    } catch (e) {
      toast((e as Error).message, true);
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead crumb="MY PROFILE" title="My Profile" sub="ชื่อและรูปของคุณใน Dashboard — เห็นได้โดยสมาชิกทีม และแสดงใน Audit Log" />
      <div className="split">
        <section className="card">
          <div className="switchline"><span className="sub">{me.email}</span><span className="status info">{me.role}</span></div>
          <div className="field"><label htmlFor="name">ชื่อที่แสดง (สูงสุด 40 ตัวอักษร)</label><input className="input" id="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field">
            <label>รูปโปรไฟล์ · 1:1</label>
            <ImageCropper aspect={1} outW={256} outH={256} onUploaded={(a) => setAvatar(a.id)} />
            {avatarAssetId && <button className="ghost small" onClick={() => setAvatar(null)}>ลบรูป</button>}
          </div>
          <button disabled={saving || !name.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          <details className="more" style={{ marginTop: 16 }} open={pw.data ? !pw.data.me.hasPassword : false}>
            <summary>{pw.data && !pw.data.me.hasPassword ? 'ตั้งรหัสผ่าน (ยังไม่ได้ตั้ง)' : 'เปลี่ยนรหัสผ่าน'}</summary>
            <div className="authform" style={{ marginTop: 8 }}>
              {pw.data?.me.hasPassword && <input className="input" id="pw-current" type="password" autoComplete="current-password" placeholder="รหัสผ่านปัจจุบัน" value={current} onChange={(e) => setCurrent(e.target.value)} />}
              <input className="input" id="pw-next" type="password" autoComplete="new-password" minLength={8} placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" value={next} onChange={(e) => setNext(e.target.value)} />
              <input className="input" id="pw-confirm" type="password" autoComplete="new-password" placeholder="ยืนยันรหัสผ่านใหม่" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
              <button className="secondary" disabled={next.length < 8} onClick={changePassword}>บันทึกรหัสผ่าน</button>
            </div>
          </details>
        </section>
        <section className="card">
          <h3>Preview</h3>
          <div className="preview" style={{ textAlign: 'center' }}>
            <div className="profileavatar" style={{ margin: '0 auto', overflow: 'hidden' }}>{avatarAssetId ? <img src={`/api/assets/${avatarAssetId}`} alt="" /> : '?'}</div>
            <h2>{name || me.email}</h2>
            <small className="muted">{me.role} · {me.email}</small>
          </div>
        </section>
      </div>
      <NotifySettings />
    </>
  );
}
