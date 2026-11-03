'use client';
import { useState } from 'react';
import { MEMBER_VARIABLES, renderMemberTemplate, type AutoRole } from '@nexus/shared';
import { PageHead, Loading } from '@/components/Shell';
import { GuildSelect, useGuildAssets, ChannelSelect, RoleSelect } from '@/components/GuildSelect';
import { useSettings } from '@/components/useSettings';

const sample = (server: string) => ({ userId: '0', username: 'newmember', displayName: 'NewMember', serverName: server, memberCount: 1234 });

export default function WelcomePage() {
  const [guildRefId, setGuild] = useState('');
  const { channels, roles } = useGuildAssets(guildRefId);
  const { draft, set, save, saving, guild, loaded } = useSettings(guildRefId);
  const preview = (t: string) => renderMemberTemplate(t, sample(guild?.name ?? 'Server')).replace('<@0>', '@NewMember');
  const updRole = (i: number, p: Partial<AutoRole>) => set('autoRoles', draft.autoRoles.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <>
      <PageHead crumb="WELCOME" title="Welcome & Auto roles" />
      <section className="card" style={{ marginBottom: 14 }}><GuildSelect value={guildRefId} onChange={setGuild} /></section>
      {!loaded ? <Loading /> : (
        <>
          {guild?.missingPerms.includes('ManageRoles') && <div className="notice">Bot ขาด Manage Roles — Auto roles จะไม่ทำงาน</div>}
          <details className="more">
            <summary>ตัวแปรที่ใช้ได้ และสิ่งที่ต้องเปิดก่อน</summary>
            <div className="notice" style={{ background: '#202d53', color: '#c7d2fe' }}>ต้องเปิด <b>Server Members Intent</b> ใน Developer Portal → Bot · ตัวแปร: {MEMBER_VARIABLES.map((v) => <code key={v} style={{ marginRight: 4 }}>{v}</code>)}</div>
          </details>
          <div className="grid two">
            <div className="grid">
              <section className="card">
                <div className="switchline"><h3>Welcome message</h3><label className="checkrow"><input type="checkbox" checked={draft.welcomeEnabled} onChange={(e) => set('welcomeEnabled', e.target.checked)} /> เปิด</label></div>
                <div className="field"><label>ห้องต้อนรับ</label><ChannelSelect channels={channels} value={draft.welcomeChannelId} onChange={(v) => set('welcomeChannelId', v)} /></div>
                <div className="field"><label>ข้อความ</label><textarea maxLength={1500} value={draft.welcomeMessage} onChange={(e) => set('welcomeMessage', e.target.value)} /></div>
                <div className="preview"><small className="muted">Preview</small><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{preview(draft.welcomeMessage)}</p></div>
              </section>
              <section className="card">
                <div className="switchline"><h3>Join DM</h3><label className="checkrow"><input type="checkbox" checked={draft.welcomeDmEnabled} onChange={(e) => set('welcomeDmEnabled', e.target.checked)} /> เปิด</label></div>
                <div className="field"><textarea maxLength={1500} value={draft.welcomeDmMessage} onChange={(e) => set('welcomeDmMessage', e.target.value)} /></div>

              </section>
              <section className="card">
                <div className="switchline"><h3>Goodbye message</h3><label className="checkrow"><input type="checkbox" checked={draft.goodbyeEnabled} onChange={(e) => set('goodbyeEnabled', e.target.checked)} /> เปิด</label></div>
                <div className="field"><label>ห้องบอกลา</label><ChannelSelect channels={channels} value={draft.goodbyeChannelId} onChange={(v) => set('goodbyeChannelId', v)} /></div>
                <div className="field"><label>ข้อความ</label><textarea maxLength={1500} value={draft.goodbyeMessage} onChange={(e) => set('goodbyeMessage', e.target.value)} /></div>
              </section>
            </div>
            <section className="card">
              <h3>Auto roles ({draft.autoRoles.length}/10)</h3>

              {draft.autoRoles.map((r, i) => (
                <div className="targetrow" key={i}>
                  <div className="inline">
                    <RoleSelect roles={roles} value={r.roleId} onChange={(v) => updRole(i, { roleId: v })} />
                    <select value={r.target} onChange={(e) => updRole(i, { target: e.target.value as AutoRole['target'] })}>
                      <option value="human">สมาชิก (คน)</option><option value="bot">Bot</option><option value="all">ทุกคน</option>
                    </select>
                    <select value={r.delaySec} onChange={(e) => updRole(i, { delaySec: Number(e.target.value) })}>
                      {[[0, 'ทันที'], [60, '1 นาที'], [300, '5 นาที'], [600, '10 นาที'], [1800, '30 นาที'], [3600, '1 ชั่วโมง'], [86400, '24 ชั่วโมง']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <button className="ghost small" onClick={() => set('autoRoles', draft.autoRoles.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="secondary small" disabled={draft.autoRoles.length >= 10} onClick={() => set('autoRoles', [...draft.autoRoles, { roleId: '', target: 'human', delaySec: 0 }])}>＋ Add auto role</button>
            </section>
          </div>
          <div style={{ marginTop: 14, textAlign: 'right' }}><button disabled={saving || draft.autoRoles.some((r) => !r.roleId)} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></div>
        </>
      )}
    </>
  );
}
