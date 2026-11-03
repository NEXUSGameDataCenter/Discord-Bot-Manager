'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LIMITS } from '@nexus/shared';
import { PageHead, Loading, ErrorBox, useToast } from '@/components/Shell';
import { BotPicker } from '@/components/BotPicker';
import { ImageCropper } from '@/components/ImageCropper';
import { api, useApi, useEvents, fmtDate, statusClass } from '@/lib/client';
import type { GuildRow } from '@/lib/types';

type Profile = { nick: string | null; bio: string | null; avatarAssetId: string | null; bannerAssetId: string | null; status: string; lastError: string | null; lastAppliedAt: string | null };
type ProfileResp = { guild: { id: string; name: string; liveNick: string | null; missingPerms: string[] }; profile: Profile | null };
const EMPTY = { nick: null, bio: null, avatarAssetId: null, bannerAssetId: null };

export default function ProfilesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Profiles />
    </Suspense>
  );
}

function Profiles() {
  const toast = useToast();
  const params = useSearchParams();
  const [botId, setBotId] = useState('');
  const [guildRefId, setGuild] = useState(params.get('guild') ?? '');
  const [tab, setTab] = useState<'identity' | 'media' | 'sync'>('identity');
  const [draft, setDraft] = useState<Omit<Profile, 'status' | 'lastError' | 'lastAppliedAt'>>(EMPTY);
  const guilds = useApi<{ guilds: GuildRow[] }>(botId ? `/api/guilds?botId=${botId}` : null);
  const prof = useApi<ProfileResp>(guildRefId ? `/api/profiles/${guildRefId}` : null);
  useEvents((ev) => (ev.type === 'profile' && ev.guildRefId === guildRefId ? prof.reload() : undefined));

  useEffect(() => {
    if (!guildRefId && guilds.data?.guilds[0]) setGuild(guilds.data.guilds[0].id);
  }, [guilds.data, guildRefId]);
  useEffect(() => {
    const p = prof.data?.profile;
    setDraft(p ? { nick: p.nick, bio: p.bio, avatarAssetId: p.avatarAssetId, bannerAssetId: p.bannerAssetId } : EMPTY);
  }, [prof.data]);

  const p = prof.data?.profile;
  const guildName = prof.data?.guild.name ?? '';
  const nickBlocked = prof.data?.guild.missingPerms.includes('ChangeNickname');

  async function save() {
    try {
      await api(`/api/profiles/${guildRefId}`, { method: 'PUT', body: draft });
      toast('Desired profile saved · sync queued');
      prof.reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function saveAsPreset() {
    const name = prompt('ชื่อ Preset:');
    if (!name) return;
    try {
      await api('/api/presets', { body: { name, ...draft } });
      toast(`บันทึก Preset "${name}" แล้ว`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  const inherit = (key: 'nick' | 'bio', label: string) => (
    <label className="checkrow">
      <input type="checkbox" checked={draft[key] === null} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked ? null : '' })} /> Inherit global {label} (ส่ง null)
    </label>
  );

  return (
    <>
      <PageHead crumb="PROFILES" title="Server Profiles" sub="กำหนดตัวตนของ Bot แยกตามแต่ละ Server" />
      <ErrorBox error={guilds.error ?? prof.error} />
      <div className="split">
        <section className="card">
          <h3>Per-server Identity Editor</h3>
          <div className="field"><label>BOT</label><BotPicker value={botId} onChange={(id) => { setBotId(id); setGuild(''); }} /></div>
          <div className="field">
            <label>SELECT SERVER</label>
            <select value={guildRefId} onChange={(e) => setGuild(e.target.value)}>
              {!guilds.data?.guilds.length && <option value="">ไม่มี Server</option>}
              {guilds.data?.guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {guildRefId && (
            <>
              <div className="switchline"><span className="sub">Sync Status</span><span className={`status ${statusClass(p?.status ?? 'PENDING')}`}>● {p?.status ?? 'NOT SET'}</span></div>
              <div className="tabs" style={{ margin: '12px 0' }}>
                {(['identity', 'media', 'sync'] as const).map((t) => (
                  <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>
                ))}
              </div>
              {tab === 'identity' && (
                <>
                  {nickBlocked && <div className="notice">Bot ขาด Change Nickname — Server Settings → Roles → Role ของ Bot → เปิด Change Nickname</div>}
                  <div className="field">
                    <label>Nickname (max {LIMITS.nickname})</label>
                    <input className="input" maxLength={LIMITS.nickname} disabled={draft.nick === null} value={draft.nick ?? ''} onChange={(e) => setDraft({ ...draft, nick: e.target.value })} />
                    {inherit('nick', 'nickname')}
                  </div>
                  <div className="field">
                    <label>Bio (max {LIMITS.bio} characters)</label>
                    <textarea maxLength={LIMITS.bio} disabled={draft.bio === null} value={draft.bio ?? ''} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
                    <small className={`counter ${(draft.bio?.length ?? 0) > LIMITS.bio ? 'over' : ''}`}>{draft.bio?.length ?? 0}/{LIMITS.bio}</small>
                    {inherit('bio', 'bio')}
                  </div>
                </>
              )}
              {tab === 'media' && (
                <>
                  <div className="field">
                    <label>AVATAR · 1:1 CROP</label>
                    <ImageCropper aspect={1} outW={512} outH={512} onUploaded={(a) => setDraft({ ...draft, avatarAssetId: a.id })} />
                    {draft.avatarAssetId && <button className="ghost small" onClick={() => setDraft({ ...draft, avatarAssetId: null })}>Inherit global avatar (null)</button>}
                  </div>
                  <div className="field">
                    <label>BANNER · 680 × 240</label>
                    <ImageCropper aspect={680 / 240} outW={680} outH={240} onUploaded={(a) => setDraft({ ...draft, bannerAssetId: a.id })} />
                    {draft.bannerAssetId && <button className="ghost small" onClick={() => setDraft({ ...draft, bannerAssetId: null })}>Inherit global banner (null)</button>}
                  </div>
                </>
              )}
              {tab === 'sync' && (
                <>
                  <h3>Desired State vs Discord State</h3>
                  <div className="switchline" style={{ padding: '8px 0' }}>
                    <span>Nickname</span>
                    <span>
                      <code>{p?.nick ?? '(global)'}</code> vs <code>{prof.data?.guild.liveNick ?? '(global)'}</code>{' '}
                      <span className={`status ${(p?.nick ?? null) === (prof.data?.guild.liveNick ?? null) ? 'success' : 'warning'}`}>
                        {(p?.nick ?? null) === (prof.data?.guild.liveNick ?? null) ? 'Match' : 'Diff'}
                      </span>
                    </span>
                  </div>
                  {['Avatar', 'Banner', 'Bio'].map((x) => (
                    <div className="switchline" key={x} style={{ padding: '8px 0' }}>
                      <span>{x}</span>
                      <span className={`status ${statusClass(p?.status)}`}>{p?.status ?? '—'}</span>
                    </div>
                  ))}
                  {p?.lastError && <div className="err">{p.lastError}</div>}
                  <p className="sub">Last Applied: {fmtDate(p?.lastAppliedAt)} · Avatar/Banner/Bio ไม่สามารถอ่านกลับจาก Discord ได้ด้วย Guilds intent จึงแสดงผลจากการ sync ครั้งล่าสุด</p>
                  <button className="secondary" disabled={!p} onClick={save}>↻ Re-sync Profile</button>
                </>
              )}
              <div className="notice">Presence และ Activity เป็น Global ไม่สามารถตั้งค่าแยกตาม Server ได้ ส่วน Banner และ Bio ต้องตรวจสอบการแสดงผลบน Discord Client จริง</div>
              <div className="row">
                <button onClick={save}>Save &amp; Sync Profile</button>
                <button className="secondary" onClick={saveAsPreset}>Save as Preset</button>
              </div>
            </>
          )}
        </section>
        <section className="card">
          <h3>Discord Live Preview</h3>
          <div className="preview">
            <div className="profilebanner">{draft.bannerAssetId && <img src={`/api/assets/${draft.bannerAssetId}`} alt="" />}</div>
            <div className="profileavatar">{draft.avatarAssetId ? <img src={`/api/assets/${draft.avatarAssetId}`} alt="" /> : '♟'}</div>
            <h2>{draft.nick ?? '(global name)'}</h2>
            <p className="sub" style={{ whiteSpace: 'pre-wrap' }}>{draft.bio ?? '(global about me)'}</p>
            <small className="muted">BOT · {guildName || '—'}</small>
          </div>
        </section>
      </div>
    </>
  );
}
