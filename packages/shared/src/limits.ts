import type { Embed, MessagePayload } from './schemas';

/** Discord message limits (https://discord.com/developers/docs/resources/message#embed-object-embed-limits). */
export const LIMITS = {
  content: 2000,
  embeds: 10,
  embedTotal: 6000,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  buttons: 25,
  buttonsPerRow: 5,
  buttonLabel: 80,
  attachments: 10,
  nickname: 32,
  bio: 190,
} as const;

/** Characters that count towards the 6000 combined embed limit. */
export function embedLength(e: Embed): number {
  return (
    (e.title?.length ?? 0) +
    (e.description?.length ?? 0) +
    (e.footer?.text.length ?? 0) +
    (e.author?.name.length ?? 0) +
    (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0)
  );
}

export function totalEmbedLength(embeds: Embed[]): number {
  return embeds.reduce((n, e) => n + embedLength(e), 0);
}

function embedHasContent(e: Embed): boolean {
  return Boolean(e.title || e.description || e.imageUrl || e.thumbnailUrl || e.author || e.footer || e.fields?.length);
}

/**
 * Cross-field validation. Per-field limits are enforced by zod; this checks the
 * combined limits, which must also be re-checked after template variables are filled in.
 */
export function validateMessage(p: Pick<MessagePayload, 'content' | 'embeds' | 'buttons' | 'attachmentIds'> & { imageUrls?: string[] }): string[] {
  const errors: string[] = [];
  const embeds = p.embeds ?? [];
  if (p.content.length > LIMITS.content) errors.push(`Content is ${p.content.length}/${LIMITS.content} characters`);
  if (embeds.length > LIMITS.embeds) errors.push(`Too many embeds (${embeds.length}/${LIMITS.embeds})`);
  const total = totalEmbedLength(embeds);
  if (total > LIMITS.embedTotal) errors.push(`Embeds combined are ${total}/${LIMITS.embedTotal} characters`);
  embeds.forEach((e, i) => {
    if (!embedHasContent(e)) errors.push(`Embed #${i + 1} is empty`);
  });
  if ((p.buttons ?? []).length > LIMITS.buttons) errors.push(`Too many buttons (max ${LIMITS.buttons})`);
  const files = (p.attachmentIds ?? []).length + (p.imageUrls ?? []).length;
  if (files > LIMITS.attachments) errors.push(`Too many attachments + image links (max ${LIMITS.attachments})`);
  if (!p.content.trim() && embeds.length === 0 && files === 0) {
    errors.push('Message needs content, an embed or an attachment');
  }
  return errors;
}
