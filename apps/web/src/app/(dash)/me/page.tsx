'use client';
import { useState } from 'react';
import { PageHead, useToast, useMe } from '@/components/Shell';
import { ImageCropper } from '@/components/ImageCropper';
import { api } from '@/lib/client';

export default function MePage() {
  const toast = useToast();
  const me = useMe();
  const [name, setName] = useState(me.name);
  const [avatarAssetId, setAvatar] = useState<string | null>(me.avatarAssetId);
  const [saving, setSaving] = useState(false);

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
          <div className="field"><label>อีเมล (ใช้เข้าสู่ระบบ แก้ไขไม่ได้)</label><input className="input" value={me.email} disabled /></div>
          <div className="field"><label>สิทธิ์</label><input className="input" value={me.role} disabled /></div>
          <div className="field"><label htmlFor="name">ชื่อที่แสดง (สูงสุด 40 ตัวอักษร)</label><input className="input" id="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field">
            <label>รูปโปรไฟล์ · 1:1</label>
            <ImageCropper aspect={1} outW={256} outH={256} onUploaded={(a) => setAvatar(a.id)} />
            {avatarAssetId && <button className="ghost small" onClick={() => setAvatar(null)}>ลบรูป</button>}
          </div>
          <button disabled={saving || !name.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </section>
        <section className="card">
          <h3>Preview</h3>
          <div className="preview" style={{ textAlign: 'center' }}>
            <div className="profileavatar" style={{ margin: '0 auto', overflow: 'hidden' }}>{avatarAssetId ? <img src={`/api/assets/${avatarAssetId}`} alt="" /> : '♙'}</div>
            <h2>{name || me.email}</h2>
            <small className="muted">{me.role} · {me.email}</small>
          </div>
        </section>
      </div>
    </>
  );
}
