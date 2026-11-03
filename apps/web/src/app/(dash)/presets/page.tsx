'use client';
import { useState } from 'react';
import { PageHead, Loading, ErrorBox, Empty, useToast } from '@/components/Shell';
import { BotPicker } from '@/components/BotPicker';
import { api, useApi } from '@/lib/client';
import type { GuildRow, Preset } from '@/lib/types';

export default function PresetsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ presets: Preset[] }>('/api/presets');
  const [botId, setBotId] = useState('');
  const guilds = useApi<{ guilds: GuildRow[] }>(botId ? `/api/guilds?botId=${botId}` : null);
  const [presetId, setPresetId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  async function apply() {
    const preset = data?.presets.find((p) => p.id === presetId);
    if (!preset || !selected.length) return;
    if (!confirm(`Apply preset "${preset.name}" ไปยัง ${selected.length} Servers?\nจะสร้าง ${selected.length} sync jobs และเขียนทับ Profile เดิมของ Server เหล่านี้`)) return;
    try {
      const r = await api<{ queued: number }>('/api/presets/apply', { body: { presetId, guildRefIds: selected, confirmCount: selected.length } });
      toast(`${r.queued} profile jobs queued`);
      setSelected([]);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function del(p: Preset) {
    if (!confirm(`ลบ preset "${p.name}"?`)) return;
    try {
      await api(`/api/presets/${p.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <>
      <PageHead crumb="PRESETS" title="Profile Presets" sub="จัดการรูปแบบโปรไฟล์และ Bulk Apply · สร้าง Preset ได้จากหน้า Server Profiles → Save as Preset" />
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !data?.presets.length ? <Empty>ยังไม่มี Preset</Empty> : null}
      <div className="grid">
        {data?.presets.map((p) => (
          <section className="card" key={p.id}>
            <div className="botrow" style={{ paddingTop: 0 }}>
              <div className="boticon">{p.avatarAssetId ? <img src={`/api/assets/${p.avatarAssetId}`} alt="" /> : '▱'}</div>
              <div className="grow">
                <strong>{p.name}</strong>
                <small>Nick: {p.nick ?? '(global)'} · Bio: {p.bio ? `${p.bio.slice(0, 40)}…` : '(global)'} · Banner: {p.bannerAssetId ? 'custom' : '(global)'}</small>
              </div>
              <button className="danger small" onClick={() => del(p)}>Delete</button>
            </div>
          </section>
        ))}
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>Bulk Apply</h3>
        <div className="inline">
          <BotPicker value={botId} onChange={(id) => { setBotId(id); setSelected([]); }} />
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            <option value="">— เลือก Preset —</option>
            {data?.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <label className="checkrow">
          <input type="checkbox" checked={!!guilds.data?.guilds.length && selected.length === guilds.data.guilds.length} onChange={(e) => setSelected(e.target.checked ? guilds.data?.guilds.map((g) => g.id) ?? [] : [])} /> Select all
        </label>
        {guilds.data?.guilds.map((g) => (
          <label className="checkrow" key={g.id}>
            <input type="checkbox" checked={selected.includes(g.id)} onChange={(e) => toggle(g.id, e.target.checked)} /> {g.name}
            {g.missingPerms.some((m) => m.name === 'ChangeNickname') && <span className="status warning">missing Change Nickname</span>}
          </label>
        ))}
        <button disabled={!presetId || !selected.length} onClick={apply}>Apply to {selected.length} Servers</button>
      </section>
    </>
  );
}
