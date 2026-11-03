'use client';
import { useEffect, useState } from 'react';
import type { GuildSettingsInput } from '@nexus/shared';
import { api, useApi } from '@/lib/client';
import { useToast } from './Shell';

export const DEFAULT_SETTINGS: GuildSettingsInput = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage: 'ยินดีต้อนรับ {user.mention} สู่ {server.name}! คุณคือสมาชิกคนที่ {memberCount}',
  welcomeDmEnabled: false,
  welcomeDmMessage: 'ยินดีต้อนรับสู่ {server.name}!',
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: '{user.name} ได้ออกจากเซิร์ฟเวอร์แล้ว',
  autoRoles: [],
  modLogChannelId: null,
  reasonPresets: ['สแปม', 'ใช้คำหยาบ', 'โฆษณาโดยไม่ได้รับอนุญาต'],
  honeypotEnabled: false,
  honeypotChannelId: null,
  honeypotAction: 'alert',
  honeypotExemptRoleIds: [],
};

/** Loads and saves the whole settings object for one server (welcome + moderation pages share it). */
export function useSettings(guildRefId: string) {
  const toast = useToast();
  const { data, reload } = useApi<{ settings: (GuildSettingsInput & Record<string, unknown>) | null; guild: { name: string; missingPerms: string[] } }>(guildRefId ? `/api/guilds/${guildRefId}/settings` : null);
  const [draft, setDraft] = useState<GuildSettingsInput>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setDraft(s ? (Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, s[k]])) as GuildSettingsInput) : DEFAULT_SETTINGS);
  }, [data]);
  async function save() {
    setSaving(true);
    try {
      await api(`/api/guilds/${guildRefId}/settings`, { method: 'PUT', body: draft });
      toast('บันทึกแล้ว · มีผลกับ Bot ทันที');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  const set = <K extends keyof GuildSettingsInput>(k: K, v: GuildSettingsInput[K]) => setDraft((d) => ({ ...d, [k]: v }));
  return { draft, set, save, saving, guild: data?.guild, loaded: !!data };
}
