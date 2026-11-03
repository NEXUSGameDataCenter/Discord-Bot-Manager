'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PageHead, Loading, ErrorBox, Empty, useToast } from '@/components/Shell';
import { BotPicker } from '@/components/BotPicker';
import { api, useApi, useEvents, fmtDate, statusClass } from '@/lib/client';
import type { GuildRow } from '@/lib/types';

export default function ServersPage() {
  const toast = useToast();
  const [botId, setBotId] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'ok' | 'issues'>('all');
  const { data, error, loading, reload } = useApi<{ guilds: GuildRow[] }>(botId ? `/api/guilds?botId=${botId}` : null);
  useEvents((ev) => (ev.type === 'guilds' && ev.botId === botId) || ev.type === 'profile' ? reload() : undefined);

  const rows = (data?.guilds ?? [])
    .filter((g) => g.name.toLowerCase().includes(q.toLowerCase()))
    .filter((g) => (tab === 'all' ? true : tab === 'ok' ? !g.missingPerms.length : g.missingPerms.length > 0));

  async function healthCheck() {
    try {
      await api('/api/guilds/refresh', { body: { botId } });
      toast('Permission health check queued');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function setDefault(g: GuildRow, channelId: string) {
    try {
      await api(`/api/guilds/${g.id}`, { method: 'PATCH', body: { defaultChannelId: channelId || null } });
      toast('บันทึกห้องประกาศเริ่มต้นแล้ว');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function saveVars(g: GuildRow, text: string) {
    const customVars: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([a-zA-Z0-9_]{1,32})\s*=\s*(.*)$/);
      if (m) customVars[m[1]!] = m[2]!;
    }
    try {
      await api(`/api/guilds/${g.id}`, { method: 'PATCH', body: { customVars } });
      toast(`บันทึก ${Object.keys(customVars).length} ตัวแปร`);
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function leave(g: GuildRow) {
    const name = prompt(`Bot จะออกจาก 1 Server: "${g.name}" (${g.memberCount.toLocaleString()} members)\nพิมพ์ชื่อ Server เพื่อยืนยัน:`);
    if (name === null) return;
    try {
      await api(`/api/guilds/${g.id}/leave`, { body: { confirmName: name } });
      toast('Leave server job queued');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <>
      <PageHead crumb="SERVERS" title="จัดการ Servers" />
      <div className="toolbar">
        <div style={{ minWidth: 220 }}><BotPicker value={botId} onChange={setBotId} /></div>
        <input className="input grow" placeholder="Search server name..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="secondary small" disabled={!botId} onClick={healthCheck}>Run Health Check</button>
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['all', 'ok', 'issues'] as const).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'all' ? 'All' : t === 'ok' ? 'Healthy' : 'Issues'}</button>
        ))}
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !rows.length ? <Empty>ไม่พบ Server — เชิญ Bot เข้า Server จากปุ่ม Invite ในหน้า จัดการ Bots</Empty> : null}
      <div className="grid">
        {rows.map((g) => (
          <section className="card" key={g.id}>
            <div className="serverrow" style={{ paddingTop: 0 }}>
              <div className="boticon">{g.iconUrl ? <img src={g.iconUrl} alt="" /> : '▤'}</div>
              <div className="grow">
                <strong>{g.name}</strong>
                <small>{g.memberCount.toLocaleString()} Members · Joined {fmtDate(g.joinedAt)}</small>
              </div>
              {g.profileStatus && <span className={`status ${statusClass(g.profileStatus)}`}>Profile {g.profileStatus}</span>}
              <span className={`status ${g.missingPerms.length ? 'warning' : 'success'}`}>{g.missingPerms.length ? 'Issues' : 'Healthy'}</span>
            </div>
            {g.missingPerms.length > 0 && (
              <details className="more">
                <summary>⚠ ขาดสิทธิ์ {g.missingPerms.length} รายการ — ดูวิธีแก้</summary>
                <div className="notice">
                  {g.missingPerms.map((p) => (
                    <div key={p.name}>ขาด <b>{p.name}</b> — {p.fix}</div>
                  ))}
                </div>
              </details>
            )}
            {g.profileError && <div className="err">Profile sync: {g.profileError}</div>}
            <details className="more">
            <summary>ตั้งค่าเซิร์ฟเวอร์</summary>
            <div className="field">
              <label>Default announcement channel</label>
              <select value={g.defaultChannelId ?? ''} onChange={(e) => setDefault(g, e.target.value)}>
                <option value="">— none —</option>
                {g.sendableChannels.map((c) => (
                  <option key={c.channelId} value={c.channelId}>{c.type === 5 ? '📢' : '#'} {c.name}</option>
                ))}
              </select>
            </div>
            <details>
              <summary>Custom template variables ({Object.keys(g.customVars ?? {}).length})</summary>
              <VarsEditor g={g} onSave={(t) => saveVars(g, t)} />
            </details>
            </details>
            <div className="toolbar" style={{ margin: '10px 0 0' }}>
              <Link href={`/profiles?guild=${g.id}`}><button className="secondary small">Manage Profile</button></Link>
              <button className="danger small" onClick={() => leave(g)}>Leave Server</button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function VarsEditor({ g, onSave }: { g: GuildRow; onSave: (text: string) => void }) {
  const [text, setText] = useState(Object.entries(g.customVars ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'));
  return (
    <div className="field">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'event=Halloween\nlink=https://example.com'} />
      <small className="sub">ใช้ในประกาศเป็น {'{event}'} · บรรทัดละ key=value</small>
      <button className="secondary small" onClick={() => onSave(text)}>Save variables</button>
    </div>
  );
}
