export type BotRow = {
  id: string;
  applicationId: string;
  username: string;
  avatarUrl: string | null;
  status: 'OFFLINE' | 'STARTING' | 'ONLINE' | 'ERROR';
  pingMs: number | null;
  startedAt: string | null;
  lastError: string | null;
  desiredRunning: boolean;
  guildCount: number;
  inviteUrl: string;
};
export type BotsResponse = { bots: BotRow[]; permissions: { bitfield: string; list: { name: string; reason: string }[] } };

export type GuildRow = {
  id: string;
  botId: string;
  guildId: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  joinedAt: string | null;
  defaultChannelId: string | null;
  customVars: Record<string, string>;
  profileStatus: 'SYNCED' | 'PENDING' | 'FAILED' | null;
  profileError: string | null;
  missingPerms: { name: string; fix: string }[];
  sendableChannels: { channelId: string; name: string; type: number }[];
};

export type ChannelRow = { channelId: string; name: string; type: number; parentName: string | null; canAttach: boolean; canWebhook: boolean; canMentionEveryone: boolean };
export type Preset = { id: string; name: string; nick: string | null; bio: string | null; avatarAssetId: string | null; bannerAssetId: string | null };
export type AuditRow = { id: string; actor: string; action: string; targets: Record<string, unknown>; result: string; createdAt: string };
