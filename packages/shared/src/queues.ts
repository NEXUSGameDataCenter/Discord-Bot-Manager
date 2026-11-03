export const QUEUES = {
  control: 'bot-control',
  profile: 'profile-sync',
  dispatch: 'announcement-dispatch',
  delivery: 'delivery',
  manage: 'announcement-manage',
} as const;

export type ControlJob =
  | { botId: string; action: 'start' | 'stop' | 'restart' | 'refresh' }
  | { botId: string; action: 'leave'; guildId: string }
  | { botId: string; action: 'editGlobal'; username?: string; avatarAssetId?: string };

export interface ProfileJob { guildRefId: string; force?: boolean }
export interface DispatchJob { announcementId: string }
export interface DeliveryJob { deliveryId: string }
export interface ManageJob { announcementId: string; action: 'edit' | 'delete'; content?: string }

export const EVENTS_CHANNEL = 'nexus:events';

export type NexusEvent =
  | { type: 'bot'; botId: string; status: string; pingMs?: number | null }
  | { type: 'delivery'; announcementId: string; deliveryId: string; status: string }
  | { type: 'profile'; guildRefId: string; status: string }
  | { type: 'guilds'; botId: string };

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
