import { z } from 'zod';
import { validateMessage, LIMITS } from './limits';

export const snowflake = z.string().regex(/^\d{17,20}$/, 'Invalid Discord ID');
const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'URL must start with http:// or https://');

export const embedFieldSchema = z.object({
  name: z.string().min(1).max(LIMITS.fieldName),
  value: z.string().min(1).max(LIMITS.fieldValue),
  inline: z.boolean().optional(),
});

export const embedSchema = z.object({
  title: z.string().max(LIMITS.title).optional(),
  description: z.string().max(LIMITS.description).optional(),
  url: httpUrl.optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  author: z.object({ name: z.string().min(1).max(LIMITS.author), url: httpUrl.optional(), iconUrl: httpUrl.optional() }).optional(),
  thumbnailUrl: httpUrl.optional(),
  imageUrl: httpUrl.optional(),
  fields: z.array(embedFieldSchema).max(LIMITS.fields).optional(),
  footer: z.object({ text: z.string().min(1).max(LIMITS.footer), iconUrl: httpUrl.optional() }).optional(),
  timestamp: z.boolean().optional(),
});
export type Embed = z.infer<typeof embedSchema>;

export const linkButtonSchema = z.object({
  label: z.string().min(1).max(LIMITS.buttonLabel),
  url: httpUrl,
});
export type LinkButton = z.infer<typeof linkButtonSchema>;

export const messagePayloadBase = z.object({
  content: z.string().max(LIMITS.content).default(''),
  embeds: z.array(embedSchema).max(LIMITS.embeds).default([]),
  buttons: z.array(linkButtonSchema).max(LIMITS.buttons).default([]),
  attachmentIds: z.array(z.string().min(1)).max(LIMITS.attachments).default([]),
});
export type MessagePayload = z.infer<typeof messagePayloadBase>;

export const messagePayloadSchema = messagePayloadBase.superRefine((p, ctx) => {
  for (const message of validateMessage(p)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

const webhookName = z
  .string()
  .min(1)
  .max(80)
  .refine((n) => !/discord|clyde/i.test(n), 'Webhook names cannot contain "discord" or "clyde"');

export const targetSchema = z
  .object({
    guildRefId: z.string().min(1),
    channelId: snowflake,
    mode: z.enum(['BOT', 'WEBHOOK']).default('BOT'),
    pingRoleId: snowflake.optional(),
    extraText: z.string().max(500).optional(),
    skip: z.boolean().default(false),
    webhookName: webhookName.optional(),
    webhookAvatarUrl: httpUrl.optional(),
  })
  .refine((t) => t.mode === 'BOT' || !!t.webhookName, { message: 'Webhook mode needs a webhook name', path: ['webhookName'] });
export type TargetInput = z.infer<typeof targetSchema>;

export const timingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('now') }),
  z.object({ kind: z.literal('at'), runAt: z.string().datetime({ offset: true }) }),
  z.object({
    kind: z.literal('cron'),
    cron: z
      .string()
      .trim()
      .regex(/^(\S+\s+){4}\S+$/, 'Cron must have 5 fields: minute hour day month weekday'),
  }),
]);
export type Timing = z.infer<typeof timingSchema>;

export const createAnnouncementSchema = z
  .object({
    botId: z.string().min(1),
    title: z.string().min(1).max(100),
    payload: messagePayloadSchema,
    targets: z.array(targetSchema).min(1).max(500),
    allowEveryone: z.boolean().default(false),
    everyoneConfirmed: z.boolean().default(false),
    crosspost: z.boolean().default(false),
    timing: timingSchema,
    /** Number of active targets the user saw in the confirmation dialog. Must match. */
    confirmCount: z.number().int().min(0),
    isTest: z.boolean().default(false),
  })
  .superRefine((a, ctx) => {
    const active = a.targets.filter((t) => !t.skip);
    if (active.length === 0) ctx.addIssue({ code: 'custom', message: 'All targets are skipped', path: ['targets'] });
    if (a.confirmCount !== active.length)
      ctx.addIssue({ code: 'custom', message: 'Confirmation count does not match the number of targets', path: ['confirmCount'] });
    if (a.allowEveryone && !a.everyoneConfirmed)
      ctx.addIssue({ code: 'custom', message: '@everyone / @here needs an extra confirmation', path: ['everyoneConfirmed'] });
    const seen = new Set<string>();
    for (const t of a.targets) {
      const key = `${t.guildRefId}:${t.channelId}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: 'The same channel is targeted twice', path: ['targets'] });
      seen.add(key);
    }
    if (a.timing.kind === 'at' && new Date(a.timing.runAt).getTime() < Date.now() - 60_000)
      ctx.addIssue({ code: 'custom', message: 'Scheduled time is in the past', path: ['timing'] });
  });
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

/** null on any field means "inherit global" (Discord resets it). */
export const profileSchema = z.object({
  nick: z.string().trim().min(1).max(LIMITS.nickname).nullable(),
  bio: z.string().max(LIMITS.bio).nullable(),
  avatarAssetId: z.string().min(1).nullable(),
  bannerAssetId: z.string().min(1).nullable(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const presetSchema = profileSchema.extend({ name: z.string().trim().min(1).max(60) });

export const bulkApplySchema = z
  .object({ presetId: z.string().min(1), guildRefIds: z.array(z.string().min(1)).min(1).max(500), confirmCount: z.number().int() })
  .refine((b) => b.confirmCount === b.guildRefIds.length, { message: 'Confirmation count does not match', path: ['confirmCount'] });

export const addBotSchema = z.object({ token: z.string().trim().min(50).max(120) });

export const botActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('stop') }),
  z.object({ action: z.literal('restart') }),
  z.object({ action: z.literal('refresh') }),
  z.object({
    action: z.literal('editGlobal'),
    username: z.string().trim().min(2).max(32).optional(),
    avatarAssetId: z.string().min(1).optional(),
  }),
]);

export const editAnnouncementSchema = z.object({ content: z.string().max(LIMITS.content) });
export const confirmSchema = z.object({ confirmCount: z.number().int().min(0) });

export const targetGroupSchema = z.object({ name: z.string().trim().min(1).max(60), guildRefIds: z.array(z.string().min(1)).min(1).max(500) });

export const guildPatchSchema = z.object({
  defaultChannelId: snowflake.nullable().optional(),
  customVars: z.record(z.string().regex(/^[a-zA-Z0-9_]{1,32}$/), z.string().max(500)).optional(),
});
