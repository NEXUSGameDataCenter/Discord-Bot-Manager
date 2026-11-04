'use client';
import { useEffect, useState } from 'react';
import { BotPicker } from './BotPicker';
import { useApi } from '@/lib/client';
import type { ChannelRow, GuildRow } from '@/lib/types';

export type RoleRow = { roleId: string; name: string; color: number; managed: boolean; assignable: boolean };

/** Bot + server dropdowns. Calls onChange with the selected server's Guild row id. */
export function GuildSelect({ value, onChange }: { value: string; onChange: (guildRefId: string) => void }) {
  const [botId, setBotId] = useState('');
  const guilds = useApi<{ guilds: GuildRow[] }>(botId ? `/api/guilds?botId=${botId}` : null);
  useEffect(() => {
    const list = guilds.data?.guilds ?? [];
    if (list.length && !list.some((g) => g.id === value)) onChange(list[0]!.id);
  }, [guilds.data, value, onChange]);
  return (
    <div className="inline">
      <div className="field"><label>BOT</label><BotPicker value={botId} onChange={setBotId} /></div>
      <div className="field">
        <label>SERVER</label>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {!guilds.data?.guilds.length && <option value="">ไม่มี Server</option>}
          {guilds.data?.guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Channels the bot can post in + roles, for one server. */
export function useGuildAssets(guildRefId: string) {
  const ch = useApi<{ channels: ChannelRow[] }>(guildRefId ? `/api/guilds/${guildRefId}/channels` : null);
  const roles = useApi<{ roles: RoleRow[] }>(guildRefId ? `/api/guilds/${guildRefId}/roles` : null);
  return { channels: ch.data?.channels ?? [], roles: roles.data?.roles ?? [], reload: () => { ch.reload(); roles.reload(); } };
}

export function ChannelSelect({ channels, value, onChange, placeholder = '— เลือกห้อง —' }: { channels: ChannelRow[]; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {channels.map((c) => <option key={c.channelId} value={c.channelId}>#{c.name}{c.parentName ? ` · ${c.parentName}` : ''}</option>)}
    </select>
  );
}

export function RoleSelect({ roles, value, onChange, onlyAssignable = true }: { roles: RoleRow[]; value: string; onChange: (v: string) => void; onlyAssignable?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— เลือก role —</option>
      {roles.map((r) => (
        <option key={r.roleId} value={r.roleId} disabled={onlyAssignable && !r.assignable}>
          @{r.name}{onlyAssignable && !r.assignable ? (r.managed ? ' (managed)' : ' (สูงกว่า Bot)') : ''}
        </option>
      ))}
    </select>
  );
}
