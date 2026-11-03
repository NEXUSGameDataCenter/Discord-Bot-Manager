import type { MessagePayload } from './schemas';

export interface TemplateContext {
  server: { name: string; memberCount: number };
  channel: { name: string };
  date: Date;
  timezone?: string;
  /** Per-server custom variables, referenced as {key}. */
  custom?: Record<string, string>;
}

export const BUILTIN_VARIABLES = ['{server.name}', '{server.memberCount}', '{channel.name}', '{date}'] as const;

/**
 * Single-pass replacement: substituted values are never re-scanned,
 * so a server name like "{date}" cannot inject another variable.
 * Unknown variables are left untouched so typos stay visible.
 */
export function renderTemplate(input: string, ctx: TemplateContext): string {
  return input.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, key: string) => {
    switch (key) {
      case 'server.name':
        return ctx.server.name;
      case 'server.memberCount':
        return ctx.server.memberCount.toLocaleString('en-US');
      case 'channel.name':
        return ctx.channel.name;
      case 'date':
        return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: ctx.timezone ?? 'Asia/Bangkok' }).format(ctx.date);
      default:
        return ctx.custom && Object.prototype.hasOwnProperty.call(ctx.custom, key) ? (ctx.custom[key] as string) : match;
    }
  });
}

export function renderPayload(p: MessagePayload, ctx: TemplateContext): MessagePayload {
  const r = (s: string | undefined) => (s === undefined ? undefined : renderTemplate(s, ctx));
  return {
    ...p,
    content: renderTemplate(p.content, ctx),
    embeds: p.embeds.map((e) => ({
      ...e,
      title: r(e.title),
      description: r(e.description),
      author: e.author ? { ...e.author, name: renderTemplate(e.author.name, ctx) } : undefined,
      footer: e.footer ? { ...e.footer, text: renderTemplate(e.footer.text, ctx) } : undefined,
      fields: e.fields?.map((f) => ({ ...f, name: renderTemplate(f.name, ctx), value: renderTemplate(f.value, ctx) })),
    })),
  };
}
