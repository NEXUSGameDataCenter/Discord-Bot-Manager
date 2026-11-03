'use client';
import { useState } from 'react';
import { ROLE_MENU_MODES, roleMenuSchema, type RoleMenuInput, type RoleMenuOption } from '@nexus/shared';
import { PageHead, Loading, Empty, useToast } from '@/components/Shell';
import { GuildSelect, useGuildAssets, ChannelSelect, RoleSelect } from '@/components/GuildSelect';
import { api, useApi, statusClass } from '@/lib/client';

type Menu = RoleMenuInput & { id: string; status: string; lastError: string | null; messageId: string | null };
const MODE_TEXT: Record<string, string> = {
  TOGGLE: 'กดเพื่อรับ / กดอีกครั้งเพื่อถอด',
  UNIQUE: 'เลือกได้ role เดียวจากเมนูนี้ (สลับอัตโนมัติ)',
  ADD_ONLY: 'รับได้อย่างเดียว ถอดเองไม่ได้ (เช่น ยืนยันกฎ)',
  REMOVE_ONLY: 'ถอดได้อย่างเดียว',
};
const blank = (guildRefId: string): RoleMenuInput => ({ guildRefId, channelId: '', title: 'เลือก Role ของคุณ', description: '', color: 0x6366f1, type: 'BUTTON', mode: 'TOGGLE', options: [{ roleId: '', label: '', emoji: '', style: 'SECONDARY' }] });

export default function ReactionRolesPage() {
  const toast = useToast();
  const [guildRefId, setGuild] = useState('');
  const { channels, roles } = useGuildAssets(guildRefId);
  const menus = useApi<{ menus: Menu[] }>(guildRefId ? `/api/role-menus?guildRefId=${guildRefId}` : null);
  const [edit, setEdit] = useState<(RoleMenuInput & { id?: string }) | null>(null);

  const clean = (m: RoleMenuInput) => ({ ...m, options: m.options.map((o) => ({ ...o, emoji: o.emoji?.trim() || undefined })) });
  const check = edit ? roleMenuSchema.safeParse(clean(edit)) : null;
  async function save() {
    if (!edit || !check?.success) return;
    try {
      await api(edit.id ? `/api/role-menus/${edit.id}` : '/api/role-menus', { method: edit.id ? 'PUT' : 'POST', body: check.data });
      toast('กำลังโพสต์เมนูไปที่ Discord');
      setEdit(null);
      setTimeout(menus.reload, 2500);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function del(m: Menu) {
    if (!confirm(`ลบเมนู "${m.title}" และข้อความใน Discord? (role ที่สมาชิกได้รับไปแล้วจะไม่ถูกถอด)`)) return;
    await api(`/api/role-menus/${m.id}`, { method: 'DELETE' }).catch((e: Error) => toast(e.message, true));
    menus.reload();
  }
  const opt = (i: number, p: Partial<RoleMenuOption>) => edit && setEdit({ ...edit, options: edit.options.map((o, j) => (j === i ? { ...o, ...p } : o)) });

  return (
    <>
      <PageHead crumb="REACTION ROLES" title="Reaction Roles" sub="ให้สมาชิกเลือก role เองด้วยปุ่มหรือ emoji" action={guildRefId && !edit ? <button onClick={() => setEdit(blank(guildRefId))}>＋ New menu</button> : undefined} />
      <section className="card" style={{ marginBottom: 14 }}><GuildSelect value={guildRefId} onChange={(id) => { setGuild(id); setEdit(null); }} /></section>

      {edit && (
        <div className="split" style={{ marginBottom: 14 }}>
          <section className="card">
            <h3>{edit.id ? 'Edit menu' : 'New menu'}</h3>
            <div className="field"><label>ห้องที่จะโพสต์เมนู</label><ChannelSelect channels={channels} value={edit.channelId || null} onChange={(v) => setEdit({ ...edit, channelId: v ?? '' })} /></div>
            <div className="inline">
              <div className="field"><label>รูปแบบ</label>
                <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as 'BUTTON' | 'REACTION' })}>
                  <option value="BUTTON">ปุ่ม (แนะนำ)</option><option value="REACTION">Emoji reaction</option>
                </select>
              </div>
              <div className="field"><label>โหมด</label>
                <select value={edit.mode} onChange={(e) => setEdit({ ...edit, mode: e.target.value as RoleMenuInput['mode'] })}>
                  {ROLE_MENU_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="field"><label>สี</label><input className="input" type="color" value={`#${edit.color.toString(16).padStart(6, '0')}`} onChange={(e) => setEdit({ ...edit, color: parseInt(e.target.value.slice(1), 16) })} /></div>
            </div>
            <small className="sub">{MODE_TEXT[edit.mode]}</small>
            <div className="field"><label>หัวข้อ</label><input className="input" maxLength={256} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div className="field"><label>คำอธิบาย</label><textarea maxLength={2000} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <h3>ตัวเลือก ({edit.options.length}/20)</h3>
            {edit.options.map((o, i) => (
              <div className="targetrow" key={i}>
                <div className="inline">
                  <RoleSelect roles={roles} value={o.roleId} onChange={(v) => opt(i, { roleId: v, label: o.label || roles.find((r) => r.roleId === v)?.name || '' })} />
                  <input className="input" placeholder="ข้อความบนปุ่ม" maxLength={80} value={o.label} onChange={(e) => opt(i, { label: e.target.value })} />
                  <input className="input" placeholder={edit.type === 'REACTION' ? 'emoji (จำเป็น) เช่น 🔥' : 'emoji (ถ้ามี)'} value={o.emoji ?? ''} onChange={(e) => opt(i, { emoji: e.target.value })} />
                  {edit.type === 'BUTTON' && (
                    <select value={o.style} onChange={(e) => opt(i, { style: e.target.value as RoleMenuOption['style'] })}>
                      <option value="SECONDARY">เทา</option><option value="PRIMARY">น้ำเงิน</option><option value="SUCCESS">เขียว</option><option value="DANGER">แดง</option>
                    </select>
                  )}
                </div>
                <button className="ghost small" onClick={() => setEdit({ ...edit, options: edit.options.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="secondary small" disabled={edit.options.length >= 20} onClick={() => setEdit({ ...edit, options: [...edit.options, { roleId: '', label: '', emoji: '', style: 'SECONDARY' }] })}>＋ Add option</button>
            {check && !check.success && <div className="err" style={{ marginTop: 8 }}>{check.error.issues.map((i) => i.message).join(' · ')}</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button disabled={!check?.success} onClick={save}>{edit.id ? 'Update & re-post' : 'Post menu'}</button>
              <button className="ghost" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </section>
          <section className="card">
            <h3>Discord Preview</h3>
            <div className="preview">
              <div className="discordembed" style={{ borderLeftColor: `#${edit.color.toString(16).padStart(6, '0')}` }}>
                <strong>{edit.title}</strong>
                {edit.description && <p style={{ whiteSpace: 'pre-wrap' }}>{edit.description}</p>}
                {edit.options.map((o, i) => <p key={i} style={{ margin: '2px 0' }}>{o.emoji || '•'} @{roles.find((r) => r.roleId === o.roleId)?.name ?? 'role'} — {o.label}</p>)}
              </div>
              {edit.type === 'BUTTON' ? (
                <div className="btnrow">{edit.options.map((o, i) => <span key={i} className="dbtn" style={{ background: { PRIMARY: '#5865f2', SUCCESS: '#248046', DANGER: '#da373c', SECONDARY: '#4e5058' }[o.style] }}>{o.emoji} {o.label || '…'}</span>)}</div>
              ) : (
                <div className="btnrow">{edit.options.map((o, i) => <span key={i} className="status info">{o.emoji || '?'} 1</span>)}</div>
              )}
            </div>
          </section>
        </div>
      )}

      {guildRefId && !menus.data ? <Loading /> : !menus.data?.menus.length && !edit ? <Empty>ยังไม่มีเมนู — กด ＋ New menu</Empty> : null}
      <div className="grid">
        {menus.data?.menus.map((m) => (
          <section className="card" key={m.id}>
            <div className="botrow" style={{ paddingTop: 0 }}>
              <div className="boticon">◎</div>
              <div className="grow">
                <strong>{m.title}</strong>
                <small>#{channels.find((c) => c.channelId === m.channelId)?.name ?? m.channelId} · {m.type} · {m.mode} · {m.options.length} roles</small>
              </div>
              <span className={`status ${m.status === 'PUBLISHED' ? 'success' : statusClass(m.status)}`}>{m.status}</span>
            </div>
            {m.lastError && <div className="err">{m.lastError}</div>}
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="secondary small" onClick={() => setEdit({ id: m.id, guildRefId: m.guildRefId, channelId: m.channelId, title: m.title, description: m.description, color: m.color, type: m.type, mode: m.mode, options: m.options })}>Edit</button>
              <button className="danger small" onClick={() => del(m)}>Delete</button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
