'use client';
import { useState } from 'react';
import { HONEYPOT_ACTIONS } from '@nexus/shared';
import { PageHead, Loading, useToast } from '@/components/Shell';
import { GuildSelect, useGuildAssets, ChannelSelect } from '@/components/GuildSelect';
import { useSettings } from '@/components/useSettings';
import { api, useApi, fmtDate } from '@/lib/client';

type Case = { id: string; caseNo: number; action: string; targetTag: string | null; moderatorTag: string; reason: string; createdAt: string };
const ACTION_TEXT: Record<string, string> = {
  alert: 'แจ้งเตือนอย่างเดียว (ลบข้อความ + บันทึก mod log) — แนะนำตอนเริ่มใช้',
  timeout: 'Timeout 24 ชั่วโมง',
  kick: 'เตะออก',
  softban: 'Softban (แบนแล้วปลด เพื่อลบข้อความ 24 ชม.) — แนะนำสำหรับบัญชีโดนแฮก',
  ban: 'แบนถาวร + ลบข้อความ 24 ชม.',
};
const COMMANDS = ['/ban', '/unban', '/softban', '/kick', '/timeout', '/untimeout', '/warn', '/warnings', '/purge', '/lock', '/unlock', '/case'];

export default function ModerationPage() {
  const toast = useToast();
  const [guildRefId, setGuild] = useState('');
  const { channels, roles, reload } = useGuildAssets(guildRefId);
  const { draft, set, save, saving, guild, loaded } = useSettings(guildRefId);
  const cases = useApi<{ cases: Case[] }>(guildRefId ? `/api/guilds/${guildRefId}/cases` : null);
  const [newName, setNewName] = useState('honeypot');
  const [preset, setPreset] = useState('');

  async function createChannel() {
    if (!confirm(`สร้างห้องใหม่ชื่อ #${newName} เป็นห้อง Honeypot?`)) return;
    try {
      await api(`/api/guilds/${guildRefId}/honeypot`, { body: { name: newName } });
      toast('กำลังสร้างห้อง… จะถูกเลือกให้อัตโนมัติ');
      setTimeout(() => { reload(); window.location.reload(); }, 3000);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function saveWithConfirm() {
    if (draft.honeypotEnabled && (draft.honeypotAction === 'ban' || draft.honeypotAction === 'softban' || draft.honeypotAction === 'kick')) {
      const ch = channels.find((c) => c.channelId === draft.honeypotChannelId)?.name;
      if (!confirm(`⚠ เปิด Honeypot แบบ "${draft.honeypotAction}" ในห้อง #${ch}\nใครก็ตาม (ยกเว้นแอดมิน/role ที่ยกเว้น) ที่โพสต์ในห้องนี้จะถูก ${draft.honeypotAction} ทันที ยืนยัน?`)) return;
    }
    await save();
  }

  return (
    <>
      <PageHead crumb="MODERATION" title="Moderation & Honeypot" />
      <section className="card" style={{ marginBottom: 14 }}><GuildSelect value={guildRefId} onChange={setGuild} /></section>
      {!loaded ? <Loading /> : (
        <>
          {!!guild?.missingPerms.filter((p) => ['BanMembers', 'KickMembers', 'ModerateMembers', 'ManageMessages', 'ManageChannels'].includes(p)).length && (
            <div className="notice">Bot ขาดสิทธิ์: {guild.missingPerms.join(', ')} — เชิญ Bot ใหม่ด้วย Invite URL ล่าสุดในหน้า จัดการ Bots</div>
          )}
          <div className="grid two">
            <div className="grid">
              <section className="card">
                <h3>Mod log</h3>
                <div className="field"><label>ห้องบันทึกการลงโทษ (ทุก case จาก slash command และ Honeypot)</label><ChannelSelect channels={channels} value={draft.modLogChannelId} onChange={(v) => set('modLogChannelId', v)} placeholder="— ไม่บันทึก —" /></div>
                <details className="more">
                <summary>Reason presets ({draft.reasonPresets.length})</summary>
                {draft.reasonPresets.map((r, i) => (
                  <div className="row" key={i} style={{ padding: '3px 0' }}><span className="grow">{r}</span><button className="ghost small" onClick={() => set('reasonPresets', draft.reasonPresets.filter((_, j) => j !== i))}>×</button></div>
                ))}
                <div className="row"><input className="input grow" maxLength={200} value={preset} onChange={(e) => setPreset(e.target.value)} placeholder="เพิ่มเหตุผล" /><button className="secondary small" disabled={!preset.trim() || draft.reasonPresets.length >= 20} onClick={() => { set('reasonPresets', [...draft.reasonPresets, preset.trim()]); setPreset(''); }}>＋</button></div>
                </details>
              </section>
              <details className="more card">
                <summary>Slash commands ({COMMANDS.length})</summary>
                <p className="sub">แสดงเฉพาะสมาชิกที่มีสิทธิ์นั้นอยู่แล้ว · ตรวจลำดับ role ทุกครั้ง</p>
                <div className="btnrow">{COMMANDS.map((c) => <code key={c}>{c}</code>)}</div>
              </details>
            </div>
            <section className="card">
              <div className="switchline"><h3>Honeypot</h3><label className="checkrow"><input type="checkbox" checked={draft.honeypotEnabled} onChange={(e) => set('honeypotEnabled', e.target.checked)} /> เปิด</label></div>

              <div className="field"><label>ห้อง Honeypot (เลือกห้องที่มีอยู่)</label><ChannelSelect channels={channels} value={draft.honeypotChannelId} onChange={(v) => set('honeypotChannelId', v)} /></div>
              <details className="more">
              <summary>หรือสร้างห้องใหม่</summary>
              <div className="field">
                <div className="row"><span>#</span><input className="input grow" value={newName} maxLength={90} onChange={(e) => setNewName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} /><button className="secondary small" disabled={!newName} onClick={createChannel}>Create channel</button></div>
              </div>
              </details>
              <div className="field">
                <label>การลงโทษ</label>
                <select value={draft.honeypotAction} onChange={(e) => set('honeypotAction', e.target.value as typeof draft.honeypotAction)}>
                  {HONEYPOT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <small className="sub">{ACTION_TEXT[draft.honeypotAction]}</small>
              </div>
              <details className="more">
                <summary>Role ที่ยกเว้น ({draft.honeypotExemptRoleIds.length}) · แอดมินถูกยกเว้นเสมอ</summary>
                {roles.map((r) => (
                  <label className="checkrow" key={r.roleId} style={{ padding: '2px 0' }}>
                    <input type="checkbox" checked={draft.honeypotExemptRoleIds.includes(r.roleId)} onChange={(e) => set('honeypotExemptRoleIds', e.target.checked ? [...draft.honeypotExemptRoleIds, r.roleId] : draft.honeypotExemptRoleIds.filter((x) => x !== r.roleId))} /> @{r.name}
                  </label>
                ))}
              </details>
            </section>
          </div>
          <div style={{ margin: '14px 0', textAlign: 'right' }}><button disabled={saving} onClick={saveWithConfirm}>{saving ? 'Saving…' : 'Save'}</button></div>
          <section className="card">
            <h3>Recent cases</h3>
            {!cases.data?.cases.length && <p className="sub">ยังไม่มี case</p>}
            {cases.data?.cases.map((c) => (
              <div className="activityrow" key={c.id}>
                <div className="grow"><strong>#{c.caseNo} · {c.action} · {c.targetTag ?? '—'}</strong><small>by {c.moderatorTag} · {c.reason || '—'}</small></div>
                <small className="muted">{fmtDate(c.createdAt)}</small>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
