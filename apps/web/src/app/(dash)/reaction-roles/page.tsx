'use client';
import { useMemo, useState } from 'react';
import { RR_KINDS, RR_MODES, reactionRoleSchema, type ReactionRoleInput, type RrKind, type RrMode } from '@nexus/shared';
import { PageHead, Loading, Empty, ErrorBox, useToast } from '@/components/Shell';
import { GuildSelect, useGuildAssets, ChannelSelect, RoleMulti, type RoleRow } from '@/components/GuildSelect';
import { MessageEditor, DiscordPreview, cleanEmbed } from '@/components/MessageEditor';
import { api, useApi } from '@/lib/client';

type Menu = ReactionRoleInput & { id: string; status: string; lastError: string | null; messageId: string | null };
type Draft = ReactionRoleInput & { id?: string };
type Btn = ReactionRoleInput['rows'][number][number];
type Style = Btn['style'];
const STYLES: Record<Style, string> = { PRIMARY: 'Primary (น้ำเงิน)', SECONDARY: 'Secondary (เทา)', SUCCESS: 'Success (เขียว)', DANGER: 'Danger (แดง)' };
const STATUS: Record<string, [string, string]> = { PUBLISHED: ['ok', 'โพสต์แล้ว'], DRAFT: ['info', 'กำลังโพสต์'], FAILED: ['bad', 'ล้มเหลว'] };

const blank = (guildRefId: string): Draft => ({
  guildRefId, name: '', enabled: true, channelId: '', mode: 'NORMAL', messageSource: 'NEW',
  message: { content: '', embeds: [{ title: 'เลือก role ของคุณ', description: 'กดปุ่มด้านล่างเพื่อรับหรือถอด role', color: 0x4cc9e0, fields: [] }] },
  kind: 'BUTTONS', reactions: [], rows: [[{ label: '', emoji: '', style: 'SECONDARY', roleIds: [] }]],
  select: { placeholder: 'เลือก role', minValues: 0, maxValues: 1, options: [] }, allowedRoles: [], deniedRoles: [],
});

/** Strip empty optional strings before validating/saving. */
function clean(d: Draft): Draft {
  const t = (s?: string) => (s && s.trim() ? s.trim() : undefined);
  return {
    ...d,
    existingMessageId: d.messageSource === 'EXISTING' ? t(d.existingMessageId) : undefined,
    message: { content: d.message.content, embeds: d.message.embeds.map(cleanEmbed) },
    rows: d.rows.map((r) => r.map((b) => ({ ...b, label: b.label.trim(), emoji: t(b.emoji), reply: t(b.reply) }))),
    select: { ...d.select, options: d.select.options.map((o) => ({ ...o, description: t(o.description), emoji: t(o.emoji) })) },
  };
}

export default function ReactionRolesPage() {
  const toast = useToast();
  const [guildRefId, setGuild] = useState('');
  const { channels, roles } = useGuildAssets(guildRefId);
  const menus = useApi<{ menus: Menu[] }>(guildRefId ? `/api/role-menus?guildRefId=${guildRefId}` : null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [q, setQ] = useState('');
  const chName = (id: string) => channels.find((c) => c.channelId === id)?.name;

  async function toggle(m: Menu) {
    menus.setData((d) => d && { menus: d.menus.map((x) => (x.id === m.id ? { ...x, enabled: !m.enabled } : x)) });
    await api(`/api/role-menus/${m.id}`, { method: 'PATCH', body: { enabled: !m.enabled } }).catch((e: Error) => { toast(e.message, true); menus.reload(); });
  }
  async function del(m: { id: string; name: string; messageSource: string }) {
    const note = m.messageSource === 'EXISTING' ? 'ข้อความเดิมใน Discord จะยังอยู่' : 'ข้อความใน Discord จะถูกลบด้วย';
    if (!confirm(`ลบ "${m.name}"? ${note} (role ที่สมาชิกได้ไปแล้วจะไม่ถูกถอด)`)) return;
    await api(`/api/role-menus/${m.id}`, { method: 'DELETE' }).catch((e: Error) => toast(e.message, true));
    setEdit(null);
    menus.reload();
  }

  if (edit) return <Editor draft={edit} setDraft={setEdit} channels={channels} roles={roles} onDelete={del} onSaved={() => { setEdit(null); setTimeout(menus.reload, 2500); }} />;

  const list = (menus.data?.menus ?? []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHead crumb="REACTION ROLES" title="Reaction roles" sub="ให้สมาชิกรับ role เองผ่าน reaction, ปุ่ม หรือ select menu" action={guildRefId ? <button onClick={() => setEdit(blank(guildRefId))}>+ สร้าง reaction role</button> : undefined} />
      <section className="card" style={{ marginBottom: 12 }}><GuildSelect value={guildRefId} onChange={(id) => { setGuild(id); setEdit(null); }} /></section>
      {menus.loading && !menus.data ? <Loading /> : !menus.data?.menus.length ? (
        guildRefId ? <Empty>ยังไม่มี reaction role — กด “+ สร้าง reaction role”</Empty> : null
      ) : (
        <section className="card">
          <div className="toolbar"><input className="input grow" placeholder="ค้นหาชื่อ" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <table className="ntable">
            <thead><tr><th>ชื่อ</th><th>ห้อง</th><th>รูปแบบ</th><th>สถานะ</th><th className="c">เปิดใช้</th><th /></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td><button className="linkbtn" style={{ color: 'var(--text)', fontSize: 13.5 }} onClick={() => setEdit(m)}>{m.name}</button><small>{RR_MODES[m.mode].label}</small></td>
                  <td className="mono" style={{ color: 'var(--t2)', fontSize: 12.5 }}>#{chName(m.channelId) ?? m.channelId}</td>
                  <td style={{ color: 'var(--t2)' }}>{RR_KINDS[m.kind]}</td>
                  <td><span className={`ast ${STATUS[m.status]?.[0] ?? 'grey'}`} title={m.lastError ?? undefined}>{STATUS[m.status]?.[1] ?? m.status}</span>{m.lastError && <small className="err">{m.lastError}</small>}</td>
                  <td className="c"><button type="button" className={`tog ${m.enabled ? 'on' : ''}`} role="switch" aria-checked={m.enabled} aria-label="เปิดใช้" onClick={() => toggle(m)} /></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="secondary small" onClick={() => setEdit(m)}>แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Section({ title, hint, children, req }: { title: string; hint?: string; children: React.ReactNode; req?: boolean }) {
  return (
    <div className="rrsec">
      <h3>{title}{req && <span style={{ color: 'var(--red)' }}> *</span>}</h3>
      {hint && <p className="sub">{hint}</p>}
      {children}
    </div>
  );
}

function Editor({ draft, setDraft, channels, roles, onSaved, onDelete }: {
  draft: Draft; setDraft: (d: Draft | null) => void; channels: ReturnType<typeof useGuildAssets>['channels']; roles: RoleRow[];
  onSaved: () => void; onDelete: (m: { id: string; name: string; messageSource: string }) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const d = draft;
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });
  const check = useMemo(() => reactionRoleSchema.safeParse(clean(d)), [d]);
  const roleName = (id: string) => roles.find((r) => r.roleId === id)?.name;
  const roleList = (ids: string[]) => ids.map((id) => `@${roleName(id) ?? 'role'}`).join(' ');

  async function save() {
    if (!check.success) return toast(check.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ', true);
    setSaving(true);
    try {
      await api(d.id ? `/api/role-menus/${d.id}` : '/api/role-menus', { method: d.id ? 'PUT' : 'POST', body: check.data });
      toast(d.enabled ? 'บันทึกแล้ว กำลังโพสต์ไปที่ Discord' : 'บันทึกแล้ว (ปิดใช้งานอยู่)');
      onSaved();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  const setBtn = (r: number, c: number, p: Partial<Btn>) => set({ rows: d.rows.map((row, i) => (i === r ? row.map((b, j) => (j === c ? { ...b, ...p } : b)) : row)) });
  const opts = d.select.options;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1><button className="linkbtn" style={{ fontSize: 22, color: 'var(--t2)' }} onClick={() => setDraft(null)}>Reaction roles</button> <span className="muted">›</span> {d.name || 'ใหม่'}</h1>
        </div>
        <div className="phactions">
          <span className="sub">เปิดใช้</span>
          <button type="button" className={`tog ${d.enabled ? 'on' : ''}`} role="switch" aria-checked={d.enabled} aria-label="เปิดใช้" onClick={() => set({ enabled: !d.enabled })} />
          {d.id && <button className="danger small" onClick={() => onDelete({ id: d.id!, name: d.name, messageSource: d.messageSource })}>ลบ</button>}
          <button className="secondary" onClick={() => setDraft(null)}>ยกเลิก</button>
          <button disabled={saving} onClick={save}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      </div>
      {!check.success && <div className="notice">{check.error.issues[0]?.message}</div>}

      <section className="card rrcard">
        <Section title="ชื่อ" hint="ตั้งชื่อไว้ดูในเว็บ (ไม่แสดงใน Discord)" req>
          <input className="input" maxLength={100} value={d.name} placeholder="เช่น Discord Welcome Code" onChange={(e) => set({ name: e.target.value })} />
        </Section>
        <Section title="ห้อง" hint="ห้องที่จะโพสต์ข้อความ" req>
          <ChannelSelect channels={channels} value={d.channelId || null} onChange={(v) => set({ channelId: v ?? '' })} />
        </Section>
        <Section title="ประเภท" hint={RR_MODES[d.mode].hint} req>
          <select value={d.mode} onChange={(e) => set({ mode: e.target.value as RrMode })}>
            {(Object.keys(RR_MODES) as RrMode[]).map((m) => <option key={m} value={m}>{RR_MODES[m].label} — {RR_MODES[m].hint}</option>)}
          </select>
        </Section>
        <Section title="ข้อความ" hint="โพสต์ข้อความใหม่ หรือผูกกับข้อความที่มีอยู่แล้วในห้อง" req>
          <select value={d.messageSource} onChange={(e) => set({ messageSource: e.target.value as 'NEW' | 'EXISTING' })}>
            <option value="NEW">โพสต์ข้อความใหม่</option>
            <option value="EXISTING">ใช้ข้อความที่มีอยู่ (ใส่ Message ID)</option>
          </select>
          {d.messageSource === 'EXISTING' && (
            <div className="field">
              <label>Message ID</label>
              <input className="input mono" placeholder="คลิกขวาที่ข้อความ → Copy Message ID" value={d.existingMessageId ?? ''} onChange={(e) => set({ existingMessageId: e.target.value.replace(/\D/g, '') })} />
              <small className="sub">ปุ่มและ select menu ใส่ได้เฉพาะข้อความที่ Bot ส่งเอง ข้อความของคนอื่นใช้ได้แค่ Reactions</small>
            </div>
          )}
        </Section>
        <div className="rrmsg">
          <div>{d.messageSource === 'NEW' ? <MessageEditor value={d.message} onChange={(m) => set({ message: m })} /> : <p className="sub">ใช้ข้อความเดิมใน Discord — แก้ไขเนื้อหาจากที่นี่ไม่ได้</p>}</div>
          <div className="rrprev">
            <div className="sub" style={{ marginBottom: 8 }}>ตัวอย่างใน Discord</div>
            <DiscordPreview msg={d.messageSource === 'NEW' ? d.message : { content: '(ข้อความเดิม)', embeds: [] }} botName="Nexus Bot" roleName={roleName}>
              {d.kind === 'REACTIONS' && <div className="dreacts">{d.reactions.map((r, i) => <span key={i} className="dreact">{r.emoji.startsWith('<') ? `:${r.emoji.split(':')[1]}:` : r.emoji || '?'} 1</span>)}</div>}
              {d.kind === 'BUTTONS' && d.rows.map((row, i) => <div key={i} className="drow">{row.map((b, j) => <span key={j} className={`dbtn ${b.style.toLowerCase()}`}>{b.emoji && !b.emoji.startsWith('<') ? `${b.emoji} ` : ''}{b.label || (b.emoji ? '' : 'ปุ่ม')}</span>)}</div>)}
              {d.kind === 'SELECT' && <div className="dselect">{d.select.placeholder || 'เลือก'}<span>⌄</span></div>}
            </DiscordPreview>
          </div>
        </div>

        <Section title="ตัวเลือก" hint="วิธีที่สมาชิกใช้รับ role" req>
          <select value={d.kind} onChange={(e) => set({ kind: e.target.value as RrKind })}>
            {(Object.keys(RR_KINDS) as RrKind[]).map((k) => <option key={k} value={k}>{RR_KINDS[k]}</option>)}
          </select>

          {d.kind === 'REACTIONS' && (
            <div className="rrbox">
              {d.reactions.map((r, i) => (
                <div className="rrline" key={i}>
                  <input className="input emoji" placeholder="😀 หรือ <:name:id>" value={r.emoji} onChange={(e) => set({ reactions: d.reactions.map((x, j) => (j === i ? { ...x, emoji: e.target.value.trim() } : x)) })} />
                  <RoleMulti roles={roles} onlyAssignable value={r.roleIds} onChange={(v) => set({ reactions: d.reactions.map((x, j) => (j === i ? { ...x, roleIds: v } : x)) })} placeholder="role ที่จะได้รับ" />
                  <button className="ghost small" aria-label="ลบ" onClick={() => set({ reactions: d.reactions.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
              {d.reactions.length < 20 && <button className="secondary small" onClick={() => set({ reactions: [...d.reactions, { emoji: '', roleIds: [] }] })}>+ Add reaction</button>}
            </div>
          )}

          {d.kind === 'BUTTONS' && (
            <>
              {d.rows.map((row, r) => (
                <div className="rrbox" key={r}>
                  <div className="switchline"><b style={{ fontWeight: 500 }}>Row #{r + 1}</b><button className="linkbtn" onClick={() => set({ rows: d.rows.filter((_, i) => i !== r) })}>ลบแถว</button></div>
                  {row.map((b, c) => {
                    const key = `${r}:${c}`;
                    return (
                      <div className="rropt" key={c}>
                        <div className="rropthead" onClick={() => setOpen(open === key ? null : key)}>
                          <span className={`dbtn ${b.style.toLowerCase()}`}>{b.emoji && !b.emoji.startsWith('<') ? `${b.emoji} ` : ''}{b.label || 'ปุ่ม'}</span>
                          <span className="sub" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.roleIds.length ? `ให้ role ${roleList(b.roleIds)}` : ''}{b.roleIds.length && b.reply ? ' + ' : ''}{b.reply ? 'ส่งข้อความเฉพาะผู้กด' : ''}{!b.roleIds.length && !b.reply ? 'ยังไม่ได้ตั้งค่า' : ''}
                          </span>
                          {row.length < 5 && <button className="ghost small" title="ทำซ้ำ" onClick={(e) => { e.stopPropagation(); set({ rows: d.rows.map((x, i) => (i === r ? [...x.slice(0, c + 1), { ...b }, ...x.slice(c + 1)] : x)) }); }}>⧉</button>}
                          <button className="ghost small" title="ลบ" onClick={(e) => { e.stopPropagation(); set({ rows: d.rows.map((x, i) => (i === r ? x.filter((_, j) => j !== c) : x)).filter((x) => x.length) }); }}>×</button>
                        </div>
                        {open === key && (
                          <div className="rroptbody">
                            <div className="inline">
                              <div className="field"><label>ชื่อปุ่ม</label><input className="input" maxLength={80} value={b.label} onChange={(e) => setBtn(r, c, { label: e.target.value })} /></div>
                              <div className="field"><label>Emoji</label><input className="input" placeholder="😀 หรือ <:name:id>" value={b.emoji ?? ''} onChange={(e) => setBtn(r, c, { emoji: e.target.value.trim() })} /></div>
                              <div className="field"><label>สี</label><select value={b.style} onChange={(e) => setBtn(r, c, { style: e.target.value as Style })}>{(Object.keys(STYLES) as Style[]).map((s) => <option key={s} value={s}>{STYLES[s]}</option>)}</select></div>
                            </div>
                            <div className="field"><label>Role ที่ได้รับเมื่อกด (เว้นว่างได้ ถ้าต้องการให้ปุ่มส่งข้อความอย่างเดียว)</label><RoleMulti roles={roles} onlyAssignable value={b.roleIds} onChange={(v) => setBtn(r, c, { roleIds: v })} /></div>
                            <div className="field"><label>ข้อความตอบกลับเฉพาะผู้กด (ephemeral)</label><textarea rows={3} maxLength={2000} placeholder="เช่น โค้ดของคุณคือ WELCOME2026" value={b.reply ?? ''} onChange={(e) => setBtn(r, c, { reply: e.target.value })} /></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {row.length < 5 && <button className="secondary small" onClick={() => { set({ rows: d.rows.map((x, i) => (i === r ? [...x, { label: '', emoji: '', style: 'SECONDARY', roleIds: [] }] : x)) }); setOpen(`${r}:${row.length}`); }}>+ Add option</button>}
                </div>
              ))}
              {d.rows.length < 5 && <button className="secondary small" style={{ marginTop: 8 }} onClick={() => { set({ rows: [...d.rows, [{ label: '', emoji: '', style: 'SECONDARY', roleIds: [] }]] }); setOpen(`${d.rows.length}:0`); }}>+ Add row</button>}
            </>
          )}

          {d.kind === 'SELECT' && (
            <div className="rrbox">
              <div className="inline">
                <div className="field"><label>Placeholder</label><input className="input" maxLength={150} value={d.select.placeholder} onChange={(e) => set({ select: { ...d.select, placeholder: e.target.value } })} /></div>
                <div className="field"><label>เลือกอย่างน้อย</label><input className="input" type="number" min={0} max={25} value={d.select.minValues} onChange={(e) => set({ select: { ...d.select, minValues: Number(e.target.value) } })} /></div>
                <div className="field"><label>เลือกได้สูงสุด</label><input className="input" type="number" min={1} max={25} value={d.select.maxValues} onChange={(e) => set({ select: { ...d.select, maxValues: Number(e.target.value) } })} /></div>
              </div>
              {opts.map((o, i) => (
                <div className="rropt" key={i}>
                  <div className="rroptbody" style={{ borderTop: 0 }}>
                    <div className="inline">
                      <div className="field"><label>ชื่อตัวเลือก</label><input className="input" maxLength={100} value={o.label} onChange={(e) => set({ select: { ...d.select, options: opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} /></div>
                      <div className="field"><label>คำอธิบาย</label><input className="input" maxLength={100} value={o.description ?? ''} onChange={(e) => set({ select: { ...d.select, options: opts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) } })} /></div>
                      <div className="field"><label>Emoji</label><input className="input" value={o.emoji ?? ''} onChange={(e) => set({ select: { ...d.select, options: opts.map((x, j) => (j === i ? { ...x, emoji: e.target.value.trim() } : x)) } })} /></div>
                    </div>
                    <div className="rrline">
                      <RoleMulti roles={roles} onlyAssignable value={o.roleIds} onChange={(v) => set({ select: { ...d.select, options: opts.map((x, j) => (j === i ? { ...x, roleIds: v } : x)) } })} placeholder="role ที่จะได้รับ" />
                      <button className="ghost small" aria-label="ลบ" onClick={() => set({ select: { ...d.select, options: opts.filter((_, j) => j !== i) } })}>×</button>
                    </div>
                  </div>
                </div>
              ))}
              {opts.length < 25 && <button className="secondary small" onClick={() => set({ select: { ...d.select, options: [...opts, { label: '', roleIds: [] }] } })}>+ Add option</button>}
            </div>
          )}
        </Section>

        <Section title="Allowed roles" hint="เฉพาะคนที่มี role เหล่านี้ใช้เมนูได้ (เว้นว่าง = ทุกคน)">
          <RoleMulti roles={roles} value={d.allowedRoles} onChange={(v) => set({ allowedRoles: v })} placeholder="เลือก role" />
        </Section>
        <Section title="Denied roles" hint="คนที่มี role เหล่านี้ใช้เมนูไม่ได้">
          <RoleMulti roles={roles} value={d.deniedRoles} onChange={(v) => set({ deniedRoles: v })} placeholder="เลือก role" />
        </Section>
      </section>
      <ErrorBox error={undefined} />
    </>
  );
}
