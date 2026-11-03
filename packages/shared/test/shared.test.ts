import { describe, expect, it } from 'vitest';
import {
  renderTemplate,
  renderPayload,
  inviteBitfield,
  missingPermissions,
  canSendTo,
  PERMS,
  validateMessage,
  totalEmbedLength,
  classifyStatus,
  backoffDelay,
  humanReason,
  createAnnouncementSchema,
  messagePayloadSchema,
  profileSchema,
  targetSchema,
} from '../src';
import { encrypt, decrypt } from '../src/crypto';

const ctx = {
  server: { name: 'TOSM Official', memberCount: 12450 },
  channel: { name: 'announcements' },
  date: new Date('2026-11-03T05:00:00Z'),
  custom: { event: 'Halloween' },
};

describe('template rendering', () => {
  it('replaces built-in and custom variables', () => {
    expect(renderTemplate('{server.name} #{channel.name} {server.memberCount} {event}', ctx)).toBe(
      'TOSM Official #announcements 12,450 Halloween',
    );
  });
  it('formats {date} in Asia/Bangkok', () => {
    expect(renderTemplate('{date}', ctx)).toContain('2569'); // Thai Buddhist year for 2026
  });
  it('leaves unknown variables untouched', () => {
    expect(renderTemplate('{nope} {server.nam}', ctx)).toBe('{nope} {server.nam}');
  });
  it('does not re-scan substituted values (no injection)', () => {
    expect(renderTemplate('{server.name}', { ...ctx, server: { name: '{event}', memberCount: 1 } })).toBe('{event}');
  });
  it('does not resolve prototype keys as custom variables', () => {
    expect(renderTemplate('{constructor}', ctx)).toBe('{constructor}');
  });
  it('renders inside embeds', () => {
    const out = renderPayload(
      { content: 'hi', embeds: [{ title: '{server.name}', fields: [{ name: 'a', value: '{event}' }], footer: { text: '{channel.name}' } }], buttons: [], attachmentIds: [] },
      ctx,
    );
    expect(out.embeds[0]?.title).toBe('TOSM Official');
    expect(out.embeds[0]?.fields?.[0]?.value).toBe('Halloween');
    expect(out.embeds[0]?.footer?.text).toBe('announcements');
  });
});

describe('permissions', () => {
  it('computes the invite bitfield', () => {
    // View 1024 + Send 2048 + Embed 16384 + Attach 32768 + MentionEveryone 131072 + ChangeNickname 67108864 + ManageWebhooks 536870912
    expect(inviteBitfield()).toBe(604163072n);
  });
  it('lists missing permissions', () => {
    const have = PERMS.ViewChannel | PERMS.SendMessages;
    expect(missingPermissions(have, ['ViewChannel', 'SendMessages', 'EmbedLinks'])).toEqual(['EmbedLinks']);
  });
  it('checks channel sendability incl. attachments and webhooks', () => {
    const base = PERMS.ViewChannel | PERMS.SendMessages | PERMS.EmbedLinks;
    expect(canSendTo(base, { attachments: false, webhook: false })).toBe(true);
    expect(canSendTo(base, { attachments: true, webhook: false })).toBe(false);
    expect(canSendTo(base | PERMS.ManageWebhooks, { attachments: false, webhook: true })).toBe(true);
  });
});

describe('embed limit validation', () => {
  const base = { content: '', embeds: [], buttons: [], attachmentIds: [] };
  it('rejects empty messages', () => {
    expect(validateMessage(base)).toContain('Message needs content, an embed or an attachment');
  });
  it('counts combined embed length', () => {
    const embeds = Array.from({ length: 2 }, () => ({ description: 'x'.repeat(3001) }));
    expect(totalEmbedLength(embeds)).toBe(6002);
    expect(validateMessage({ ...base, embeds }).join()).toMatch(/6002\/6000/);
  });
  it('accepts exactly 6000', () => {
    const embeds = [{ description: 'x'.repeat(3000) }, { description: 'y'.repeat(3000) }];
    expect(validateMessage({ ...base, embeds })).toEqual([]);
  });
  it('zod rejects >10 embeds and >2000 content', () => {
    expect(messagePayloadSchema.safeParse({ content: 'a'.repeat(2001) }).success).toBe(false);
    expect(messagePayloadSchema.safeParse({ embeds: Array.from({ length: 11 }, () => ({ title: 't' })) }).success).toBe(false);
  });
  it('rejects empty embeds', () => {
    expect(validateMessage({ ...base, content: 'x', embeds: [{}] })).toContain('Embed #1 is empty');
  });
});

describe('delivery retry logic', () => {
  it('classifies statuses', () => {
    expect(classifyStatus(500)).toBe('retry');
    expect(classifyStatus(503)).toBe('retry');
    expect(classifyStatus(429)).toBe('retry');
    expect(classifyStatus(undefined)).toBe('retry');
    expect(classifyStatus(403)).toBe('fatal');
    expect(classifyStatus(404)).toBe('fatal');
    expect(classifyStatus(400)).toBe('fatal');
  });
  it('backs off exponentially with jitter bounds', () => {
    expect(backoffDelay(1, 2000, 60000, () => 0)).toBe(1000);
    expect(backoffDelay(1, 2000, 60000, () => 1)).toBe(2000);
    expect(backoffDelay(3, 2000, 60000, () => 1)).toBe(8000);
    expect(backoffDelay(20, 2000, 60000, () => 1)).toBe(60000);
  });
  it('gives human reasons', () => {
    expect(humanReason(403, 50013)).toMatch(/Missing Permissions/);
    expect(humanReason(404, 10003)).toMatch(/ห้อง/);
  });
});

describe('schemas', () => {
  const target = { guildRefId: 'g1', channelId: '123456789012345678' };
  const valid = {
    botId: 'b1',
    title: 'Update',
    payload: { content: 'hello' },
    targets: [target, { guildRefId: 'g2', channelId: '123456789012345679', skip: true }],
    timing: { kind: 'now' },
    confirmCount: 1,
  };
  it('accepts a valid announcement', () => {
    expect(createAnnouncementSchema.safeParse(valid).success).toBe(true);
  });
  it('requires confirmCount to equal active targets', () => {
    expect(createAnnouncementSchema.safeParse({ ...valid, confirmCount: 2 }).success).toBe(false);
  });
  it('requires extra confirmation for @everyone', () => {
    expect(createAnnouncementSchema.safeParse({ ...valid, allowEveryone: true }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...valid, allowEveryone: true, everyoneConfirmed: true }).success).toBe(true);
  });
  it('rejects duplicate targets', () => {
    expect(createAnnouncementSchema.safeParse({ ...valid, targets: [target, target], confirmCount: 2 }).success).toBe(false);
  });
  it('requires a webhook name in webhook mode and blocks "discord"', () => {
    expect(targetSchema.safeParse({ ...target, mode: 'WEBHOOK' }).success).toBe(false);
    expect(targetSchema.safeParse({ ...target, mode: 'WEBHOOK', webhookName: 'Discord News' }).success).toBe(false);
    expect(targetSchema.safeParse({ ...target, mode: 'WEBHOOK', webhookName: 'Nexus News' }).success).toBe(true);
  });
  it('validates bio length and allows null = inherit', () => {
    expect(profileSchema.safeParse({ nick: null, bio: 'x'.repeat(191), avatarAssetId: null, bannerAssetId: null }).success).toBe(false);
    expect(profileSchema.safeParse({ nick: null, bio: null, avatarAssetId: null, bannerAssetId: null }).success).toBe(true);
  });
});

describe('token encryption', () => {
  const key = 'a'.repeat(64);
  it('round-trips and uses a random IV', () => {
    const a = encrypt('secret-token', key);
    expect(a).not.toBe(encrypt('secret-token', key));
    expect(decrypt(a, key)).toBe('secret-token');
  });
  it('fails on tampering or wrong key', () => {
    const a = Buffer.from(encrypt('secret-token', key), 'base64');
    a[a.length - 1] = a[a.length - 1]! ^ 1;
    expect(() => decrypt(a.toString('base64'), key)).toThrow();
    expect(() => decrypt(encrypt('x', key), 'b'.repeat(64))).toThrow();
  });
});
