'use client';
import { useState } from 'react';
import { PageHead, Loading, ErrorBox, Empty, useToast } from '@/components/Shell';
import { BotPicker } from '@/components/BotPicker';
import { api, useApi } from '@/lib/client';
import type { GuildRow } from '@/lib/types';

type Group = { id: string; name: string; guildRefIds: string[] };

export default function TargetsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ groups: Group[] }>('/api/target-groups');
  const [botId, setBotId] = useState('');
  const guilds = useApi<{ guilds: GuildRow[] }>(botId ? `/api/guilds?botId=${botId}` : null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const nameOf = (id: string) => guilds.data?.guilds.find((g) => g.id === id)?.name;

  async function create() {
    try {
      await api('/api/target-groups', { body: { name, guildRefIds: selected } });
      toast('Target group saved');
      setName('');
      setSelected([]);
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  async function del(g: Group) {
    if (!confirm(`ลบกลุ่ม "${g.name}"? (ไม่กระทบ Server จริง)`)) return;
    await api(`/api/target-groups/${g.id}`, { method: 'DELETE' }).catch((e: Error) => toast(e.message, true));
    reload();
  }

  return (
    <>
      <PageHead crumb="TARGETS" title="Target Groups" />
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : !data?.groups.length ? <Empty>ยังไม่มีกลุ่ม</Empty> : null}
      <div className="grid">
        {data?.groups.map((g) => (
          <section className="card" key={g.id}>
            <div className="botrow" style={{ paddingTop: 0 }}>
              <div className="boticon">♧</div>
              <div className="grow"><strong>{g.name}</strong><small>{g.guildRefIds.map((id) => nameOf(id) ?? '…').join(', ')}</small></div>
              <span className="status info">{g.guildRefIds.length} Servers</span>
              <button className="danger small" onClick={() => del(g)}>Delete</button>
            </div>
          </section>
        ))}
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <h3>＋ New Group</h3>
        <div className="inline">
          <BotPicker value={botId} onChange={setBotId} />
          <input className="input" placeholder="Group name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {guilds.data?.guilds.map((g) => (
          <label className="checkrow" key={g.id}>
            <input type="checkbox" checked={selected.includes(g.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id)))} /> {g.name}
            {!g.defaultChannelId && <span className="status warning">no default channel</span>}
          </label>
        ))}
        <button disabled={!name.trim() || !selected.length} onClick={create}>Save Group ({selected.length})</button>
      </section>
    </>
  );
}
