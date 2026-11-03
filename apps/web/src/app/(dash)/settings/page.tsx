'use client';
import { PageHead, Loading } from '@/components/Shell';
import { useApi } from '@/lib/client';

type Sys = { db: boolean; redis: boolean; worker: { ok: boolean; workers: { name: string; running: boolean }[]; bots: { botId: string; ready: boolean }[]; uptimeSec: number } | null };

export default function SettingsPage() {
  const { data } = useApi<Sys>('/api/system');
  const pill = (ok: boolean | undefined, yes = 'Connected', no = 'Down') => <span className={`status ${ok ? 'success' : 'failed'}`}>{ok ? yes : no}</span>;
  return (
    <>
      <PageHead crumb="SETTINGS" title="Settings" sub="ตั้งค่าความปลอดภัยและโครงสร้างระบบ" />
      <section className="card">
        <h3>Security &amp; Authentication</h3>
        {[['Discord OAuth2 (Auth.js)', 'Enabled'], ['Admin ID allow-list (ADMIN_DISCORD_IDS)', 'Active'], ['Bot token encryption (AES-256-GCM)', 'Enabled'], ['Tokens never sent to browser', 'Active'], ['Gateway intents', 'Guilds only']].map(([k, v]) => (
          <div className="switchline" key={k} style={{ padding: '8px 0' }}><span>{k}</span><span className="status success">{v}</span></div>
        ))}
      </section>
      <div className="grid two" style={{ marginTop: 14 }}>
        <section className="card">
          <h3>Infrastructure</h3>
          {!data ? <Loading rows={2} /> : (
            <>
              <div className="switchline" style={{ padding: '8px 0' }}><span>PostgreSQL</span>{pill(data.db)}</div>
              <div className="switchline" style={{ padding: '8px 0' }}><span>Redis</span>{pill(data.redis)}</div>
              <div className="switchline" style={{ padding: '8px 0' }}><span>Bot worker</span>{pill(!!data.worker?.ok, `Running · ${Math.round((data.worker?.uptimeSec ?? 0) / 60)}m`, 'Unreachable')}</div>
              {data.worker?.workers.map((w) => <div className="switchline" key={w.name} style={{ padding: '4px 0 4px 12px' }}><small>BullMQ · {w.name}</small>{pill(w.running, 'Running', 'Stopped')}</div>)}
            </>
          )}
        </section>
        <section className="card">
          <h3>Application Preferences</h3>
          <div className="switchline" style={{ padding: '8px 0' }}><span>Interface Language</span><span className="status info">Thai + English</span></div>
          <div className="switchline" style={{ padding: '8px 0' }}><span>Timezone</span><span className="status info">Asia/Bangkok (UTC+7)</span></div>
          <p className="sub">ค่าเหล่านี้กำหนดผ่าน environment / code ในเวอร์ชันนี้</p>
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>About Nexus</h3>
        <h2>NEXUS BOT CONTROL</h2>
        <p className="sub">Version 1.0.0 · Self-hosted Discord Management Platform</p>
      </section>
    </>
  );
}
