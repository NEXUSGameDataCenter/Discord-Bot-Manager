'use client';
import { useState } from 'react';
import { PageHead, Loading, ErrorBox, Empty, useToast } from '@/components/Shell';
import { ImageCropper } from '@/components/ImageCropper';
import { api, useApi, useEvents, statusClass } from '@/lib/client';
import type { BotsResponse, BotRow } from '@/lib/types';

function uptime(startedAt: string | null) {
  if (!startedAt) return '—';
  const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export default function BotsPage() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<BotsResponse>('/api/bots');
  const [token, setToken] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BotRow | null>(null);
  useEvents((ev) => {
    if (ev.type !== 'bot' || !data) return;
    // Optimistic live patch of status/ping; full reload when state changes.
    setData({ ...data, bots: data.bots.map((b) => (b.id === ev.botId ? { ...b, status: (ev.status === 'RECONNECTING' ? 'STARTING' : ev.status) as BotRow['status'], pingMs: ev.pingMs ?? b.pingMs } : b)) });
    if (ev.status !== 'ONLINE' || ev.pingMs === undefined) reload();
  });

  async function addBot() {
    setAdding(true);
    try {
      await api('/api/bots', { body: { token } });
      setToken('');
      toast('Bot ถูกเพิ่มและกำลังเชื่อมต่อ');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setAdding(false);
    }
  }
  async function act(b: BotRow, action: 'start' | 'stop' | 'restart' | 'refresh') {
    try {
      await api(`/api/bots/${b.id}/action`, { body: { action } });
      toast(`${action} queued · ${b.username}`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function remove(b: BotRow) {
    const name = prompt(`ลบ Bot "${b.username}" ออกจาก Dashboard (Bot ยังอยู่ใน ${b.guildCount} servers แต่จะหยุดทำงาน)\nพิมพ์ชื่อ Bot เพื่อยืนยัน:`);
    if (name === null) return;
    try {
      await api(`/api/bots/${b.id}`, { method: 'DELETE', body: { confirmName: name } });
      toast('ลบ Bot แล้ว');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <>
      <PageHead crumb="BOTS" title="จัดการ Bots" sub="ควบคุม Bot instances และ Gateway connections" />
      <section className="card" style={{ marginBottom: 14 }}>
        <h3>＋ Add Bot</h3>
        <p className="sub">วาง Bot token จาก Discord Developer Portal → Bot → Reset Token ระบบจะตรวจสอบกับ GET /users/@me ก่อนบันทึก และเข้ารหัสด้วย AES-256-GCM (token จะไม่ถูกส่งกลับมาที่เบราว์เซอร์)</p>
        <div className="row">
          <input className="input grow" type="password" autoComplete="off" placeholder="Bot token" value={token} onChange={(e) => setToken(e.target.value)} />
          <button disabled={adding || token.trim().length < 50} onClick={addBot}>{adding ? 'Validating…' : 'Validate & Add'}</button>
        </div>
      </section>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !data?.bots.length ? <Empty>ยังไม่มี Bot</Empty> : null}
      <div className="grid">
        {data?.bots.map((b) => (
          <section className="card" key={b.id}>
            <div className="botrow" style={{ paddingTop: 0 }}>
              <div className="boticon">{b.avatarUrl ? <img src={b.avatarUrl} alt="" /> : '♟'}</div>
              <div className="grow">
                <strong>{b.username}</strong>
                <small>App ID: {b.applicationId}</small>
              </div>
              <span className={`status ${statusClass(b.status)}`}>{b.status}</span>
            </div>
            {b.lastError && <div className="notice">{b.lastError}</div>}
            <div className="grid three">
              <div><small className="muted">Ping</small><h2>{b.pingMs ?? '—'} ms</h2></div>
              <div><small className="muted">Uptime</small><h2>{uptime(b.startedAt)}</h2></div>
              <div><small className="muted">Guilds</small><h2>{b.guildCount}</h2></div>
            </div>
            <div className="toolbar" style={{ margin: '12px 0 0' }}>
              {b.status === 'ONLINE' || b.status === 'STARTING' ? (
                <button className="secondary small" onClick={() => act(b, 'stop')}>Ⅱ Stop</button>
              ) : (
                <button className="secondary small" onClick={() => act(b, 'start')}>▶ Start</button>
              )}
              <button className="secondary small" onClick={() => act(b, 'restart')}>↻ Restart</button>
              <button className="secondary small" onClick={() => { navigator.clipboard.writeText(b.inviteUrl); toast('คัดลอก Invite URL แล้ว'); }}>⧉ Copy Invite URL</button>
              <a href={b.inviteUrl} target="_blank" rel="noreferrer"><button className="secondary small">↗ Invite</button></a>
              <button className="secondary small" onClick={() => setEditing(b)}>Edit Global Profile</button>
              <button className="danger small" onClick={() => remove(b)}>Remove</button>
            </div>
          </section>
        ))}
      </div>
      {editing && <GlobalEditor bot={editing} onClose={() => setEditing(null)} />}
      {data && (
        <section className="card" style={{ marginTop: 14 }}>
          <h3>Invite Permissions · bitfield <code>{data.permissions.bitfield}</code></h3>
          {data.permissions.list.map((p) => (
            <div className="switchline" key={p.name} style={{ padding: '6px 0' }}>
              <span>{p.name}</span>
              <small className="muted" style={{ textAlign: 'right' }}>{p.reason}</small>
            </div>
          ))}
          <p className="sub">Gateway intent: <code>Guilds</code> เท่านั้น (ไม่มี privileged intents)</p>
        </section>
      )}
    </>
  );
}

function GlobalEditor({ bot, onClose }: { bot: BotRow; onClose: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState(bot.username);
  const [avatarAssetId, setAvatar] = useState<string | undefined>();
  async function save() {
    if (!confirm('การเปลี่ยน Global Profile ถูกจำกัด rate limit อย่างหนักโดย Discord (username ~2 ครั้ง/ชั่วโมง) และมีผลทุก Server ที่ไม่ได้ตั้ง Profile เฉพาะ ต้องการดำเนินการต่อ?')) return;
    try {
      await api(`/api/bots/${bot.id}/action`, { body: { action: 'editGlobal', username: username !== bot.username ? username : undefined, avatarAssetId } });
      toast('Global profile update queued');
      onClose();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <section className="card" style={{ marginTop: 14 }}>
      <div className="switchline"><h3>Global Bot Identity · {bot.username}</h3><button className="ghost small" onClick={onClose}>✕</button></div>
      <div className="notice">Global username/avatar ถูก rate-limit หนักโดย Discord · Banner และ About me ทั่วโลกแก้ได้ที่ Developer Portal</div>
      <div className="field"><label>Username</label><input className="input" maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} /></div>
      <div className="field"><label>Avatar · 1:1</label><ImageCropper aspect={1} outW={512} outH={512} onUploaded={(a) => setAvatar(a.id)} /></div>
      <button onClick={save}>Save Global Profile</button>
    </section>
  );
}
