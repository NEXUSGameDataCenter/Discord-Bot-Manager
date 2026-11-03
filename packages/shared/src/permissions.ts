/** Permission bits (https://discord.com/developers/docs/topics/permissions). */
export const PERMS = {
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  ManageChannels: 1n << 4n,
  AddReactions: 1n << 6n,
  ManageMessages: 1n << 13n,
  ManageRoles: 1n << 28n,
  ModerateMembers: 1n << 40n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  MentionEveryone: 1n << 17n,
  ChangeNickname: 1n << 26n,
  ManageWebhooks: 1n << 29n,
} as const;
export type PermName = keyof typeof PERMS;

export const REQUIRED_PERMISSIONS: { name: PermName; reason: string }[] = [
  { name: 'ViewChannel', reason: 'เห็นห้องเพื่อแสดงในรายการปลายทางและส่งข้อความ' },
  { name: 'SendMessages', reason: 'ส่งประกาศ และ crosspost ข้อความของตัวเองในห้อง Announcement' },
  { name: 'EmbedLinks', reason: 'ส่ง Rich Embed' },
  { name: 'AttachFiles', reason: 'แนบไฟล์ไปกับประกาศ' },
  { name: 'MentionEveryone', reason: 'ใช้ @everyone / @here เมื่อผู้ใช้ยืนยันเปิดเท่านั้น' },
  { name: 'ChangeNickname', reason: 'ตั้ง Nickname ของ Bot แยกตาม Server' },
  { name: 'ManageWebhooks', reason: 'สร้างและใช้ Webhook สำหรับโหมดส่งแบบ Custom Identity' },
  { name: 'ManageRoles', reason: 'Auto roles และ Reaction roles (role ของ Bot ต้องอยู่สูงกว่า role ที่แจก)' },
  { name: 'AddReactions', reason: 'ใส่ emoji ใต้เมนู Reaction role' },
  { name: 'KickMembers', reason: '/kick และ Honeypot แบบ kick' },
  { name: 'BanMembers', reason: '/ban /softban /unban และ Honeypot แบบ ban' },
  { name: 'ModerateMembers', reason: '/timeout และ Honeypot แบบ timeout' },
  { name: 'ManageMessages', reason: '/purge และลบข้อความในห้อง Honeypot' },
  { name: 'ManageChannels', reason: '/lock /unlock และสร้างห้อง Honeypot' },
];

export const CHANNEL_SEND_PERMS: PermName[] = ['ViewChannel', 'SendMessages', 'EmbedLinks'];

export function inviteBitfield(): bigint {
  return REQUIRED_PERMISSIONS.reduce((acc, p) => acc | PERMS[p.name], 0n);
}

export function inviteUrl(applicationId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot%20applications.commands&permissions=${inviteBitfield().toString()}`;
}

export function missingPermissions(have: bigint, need: readonly PermName[]): PermName[] {
  return need.filter((n) => (have & PERMS[n]) !== PERMS[n]);
}

export function canSendTo(have: bigint, opts: { attachments: boolean; webhook: boolean }): boolean {
  const need: PermName[] = [...CHANNEL_SEND_PERMS];
  if (opts.attachments) need.push('AttachFiles');
  if (opts.webhook) need.push('ManageWebhooks');
  return missingPermissions(have, need).length === 0;
}

export const PERMISSION_FIX: Record<PermName, string> = {
  ViewChannel: 'เปิด View Channel ให้ Role ของ Bot ในห้องนั้น',
  SendMessages: 'เปิด Send Messages ให้ Role ของ Bot',
  EmbedLinks: 'เปิด Embed Links ให้ Role ของ Bot',
  AttachFiles: 'เปิด Attach Files ให้ Role ของ Bot',
  MentionEveryone: 'เปิด Mention @everyone ให้ Role ของ Bot (ถ้าต้องการใช้)',
  ChangeNickname: 'Server Settings → Roles → Role ของ Bot → เปิด Change Nickname',
  ManageWebhooks: 'เปิด Manage Webhooks ให้ Role ของ Bot (จำเป็นสำหรับโหมด Webhook)',
  ManageRoles: 'เปิด Manage Roles และลาก Role ของ Bot ให้อยู่สูงกว่า role ที่ต้องการแจก',
  AddReactions: 'เปิด Add Reactions ให้ Role ของ Bot',
  KickMembers: 'เปิด Kick Members ให้ Role ของ Bot',
  BanMembers: 'เปิด Ban Members ให้ Role ของ Bot',
  ModerateMembers: 'เปิด Timeout Members ให้ Role ของ Bot',
  ManageMessages: 'เปิด Manage Messages ให้ Role ของ Bot',
  ManageChannels: 'เปิด Manage Channels ให้ Role ของ Bot',
};
