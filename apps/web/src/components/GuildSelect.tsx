'use client';
import { useEffect, useState } from 'react';
import { BotPicker } from './BotPicker';
import { Combo, type ComboItem } from './Combo';
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

const hex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : undefined);

/** Searchable channel dropdown, grouped by category like Discord. */
export function ChannelSelect({ channels, value, onChange, placeholder = '— เลือกห้อง —' }: { channels: ChannelRow[]; value: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const items: ComboItem[] = channels.map((c) => ({ value: c.channelId, label: c.name, group: c.parentName ?? 'ไม่มีหมวด' }));
  return <Combo items={items} value={value} onChange={(v) => onChange((v as string | null) || null)} placeholder={placeholder} prefix="#" empty="ไม่พบห้อง" />;
}

const roleItems = (roles: RoleRow[], onlyAssignable: boolean): ComboItem[] =>
  roles.map((r) => ({ value: r.roleId, label: r.name, color: hex(r.color), disabled: onlyAssignable && !r.assignable, hint: onlyAssignable && !r.assignable ? (r.managed ? 'managed' : 'สูงกว่า Bot') : undefined }));

/** Searchable single role dropdown. */
export function RoleSelect({ roles, value, onChange, onlyAssignable = true }: { roles: RoleRow[]; value: string; onChange: (v: string) => void; onlyAssignable?: boolean }) {
  return <Combo items={roleItems(roles, onlyAssignable)} value={value || null} onChange={(v) => onChange((v as string | null) ?? '')} placeholder="— เลือก role —" prefix="@" empty="ไม่พบ role" />;
}

/** Searchable multi role picker (tags). */
export function RoleMulti({ roles, value, onChange, onlyAssignable = false, placeholder = 'เลือก role' }: { roles: RoleRow[]; value: string[]; onChange: (v: string[]) => void; onlyAssignable?: boolean; placeholder?: string }) {
  return <Combo multi items={roleItems(roles, onlyAssignable)} value={value} onChange={(v) => onChange((v as string[]) ?? [])} placeholder={placeholder} prefix="@" empty="ไม่พบ role" />;
}
