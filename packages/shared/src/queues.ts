export const QUEUES = {
  control: 'bot-control',
  profile: 'profile-sync',
  dispatch: 'announcement-dispatch',
  delivery: 'delivery',
  manage: 'announcement-manage',
  notify: 'notify',
} as const;

export type ControlJob =
  | { botId: string; action: 'start' | 'stop' | 'restart' | 'refresh' }
  | { botId: string; action: 'leave'; guildId: string }
  | { botId: string; action: 'editGlobal'; username?: string; avatarAssetId?: string }
  | { botId: string; action: 'publishRoleMenu'; menuId: string }
  | { botId: string; action: 'deleteRoleMenu'; guildId: string; channelId: string; messageId: string }
  | { botId: string; action: 'createHoneypot'; guildRefId: string; name: string }
  | { botId: string; action: 'autorole'; guildId: string; userId: string; roleIds: string[] };

export interface ProfileJob { guildRefId: string; force?: boolean }
export interface DispatchJob { announcementId: string }
export interface DeliveryJob { deliveryId: string }
export interface ManageJob { announcementId: string; action: 'edit' | 'delete'; content?: string }

export const EVENTS_CHANNEL = 'nexus:events';
/** Web → bot: a guild's module settings changed (payload = guildRefId). */
export const CONFIG_CHANNEL = 'nexus:config';

export type NexusEvent =
  | { type: 'bot'; botId: string; status: string; pingMs?: number | null }
  | { type: 'delivery'; announcementId: string; deliveryId: string; status: string }
  | { type: 'profile'; guildRefId: string; status: string }
  | { type: 'guilds'; botId: string }
  | { type: 'notify'; emails: string[] };

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
