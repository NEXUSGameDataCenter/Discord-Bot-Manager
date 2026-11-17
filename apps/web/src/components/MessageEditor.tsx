'use client';
import type { Embed } from '@nexus/shared';
import { LIMITS } from '@nexus/shared';
import { emojify } from 'node-emoji';

/** Preview of what the bot sends: ':name:' shortcodes become emoji. */
export const emo = (t: string) => t.split(/(<a?:\w+:\d+>)/).map((p, i) => (i % 2 ? p : emojify(p))).join('');

export type Msg = { content: string; embeds: Embed[] };
const SWATCH = [0x5fbf8f, 0x4c9be0, 0x9b6bd6, 0xe0567a, 0xe6c14a, 0xe08a3c, 0xd9534f, 0x95a5a6, 0x607d8b, 0xffffff];
const hex = (n?: number) => `#${(n ?? 0x4cc9e0).toString(16).padStart(6, '0')}`;
const len = (e: Embed) => (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0) + (e.author?.name.length ?? 0) + (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);

/** Drops empty optional strings so the payload validates (URLs must be real URLs). */
export function cleanEmbed(e: Embed): Embed {
  const t = (s?: string) => (s && s.trim() ? s : undefined);
  return {
    title: t(e.title), description: t(e.description), url: t(e.url), color: e.color,
    author: e.author && t(e.author.name) ? { name: e.author.name, url: t(e.author.url), iconUrl: t(e.author.iconUrl) } : undefined,
    thumbnailUrl: t(e.thumbnailUrl), imageUrl: t(e.imageUrl),
    fields: (e.fields ?? []).filter((f) => f.name.trim() && f.value.trim()),
    footer: e.footer && t(e.footer.text) ? { text: e.footer.text, iconUrl: t(e.footer.iconUrl) } : undefined,
    timestamp: e.timestamp || undefined,
  };
}

function EmbedEditor({ e, set, remove }: { e: Embed; set: (e: Embed) => void; remove: () => void }) {
  const fields = e.fields ?? [];
  return (
    <div className="embedbox" style={{ '--ec': hex(e.color) } as React.CSSProperties}>
      <div className="switchline"><span className="sub">Embed · {len(e)}/6000</span><button className="ghost small" onClick={remove}>ลบ embed</button></div>
      <div className="field"><label>สี</label>
        <div className="swatches">
          <input type="color" value={hex(e.color)} onChange={(x) => set({ ...e, color: parseInt(x.target.value.slice(1), 16) })} aria-label="เลือกสี" />
          {SWATCH.map((c) => <button key={c} type="button" className={`sw ${e.color === c ? 'on' : ''}`} style={{ background: hex(c) }} onClick={() => set({ ...e, color: c })} aria-label={hex(c)} />)}
        </div>
      </div>
      <div className="inline">
        <div className="field"><label>Author</label><input className="input" maxLength={LIMITS.author} placeholder="ชื่อผู้เขียน" value={e.author?.name ?? ''} onChange={(x) => set({ ...e, author: { ...e.author, name: x.target.value } })} /></div>
        <div className="field"><label>Author icon URL</label><input className="input" placeholder="https://" value={e.author?.iconUrl ?? ''} onChange={(x) => set({ ...e, author: { name: e.author?.name ?? '', ...e.author, iconUrl: x.target.value } })} /></div>
      </div>
      <div className="inline">
        <div className="field"><label>Title</label><input className="input" maxLength={LIMITS.title} value={e.title ?? ''} onChange={(x) => set({ ...e, title: x.target.value })} /></div>
        <div className="field"><label>Title URL</label><input className="input" placeholder="https://" value={e.url ?? ''} onChange={(x) => set({ ...e, url: x.target.value })} /></div>
      </div>
      <div className="field"><label>Description <span className="sub">{e.description?.length ?? 0}/{LIMITS.description}</span></label><textarea maxLength={LIMITS.description} rows={6} value={e.description ?? ''} onChange={(x) => set({ ...e, description: x.target.value })} /></div>
      <div className="field"><label>Fields</label>
        {fields.map((f, i) => (
          <div className="fieldrow" key={i}>
            <input className="input" placeholder="ชื่อ" maxLength={LIMITS.fieldName} value={f.name} onChange={(x) => set({ ...e, fields: fields.map((g, j) => (j === i ? { ...g, name: x.target.value } : g)) })} />
            <input className="input" placeholder="ค่า" maxLength={LIMITS.fieldValue} value={f.value} onChange={(x) => set({ ...e, fields: fields.map((g, j) => (j === i ? { ...g, value: x.target.value } : g)) })} />
            <label className="checkrow" style={{ padding: 0 }}><input type="checkbox" checked={!!f.inline} onChange={(x) => set({ ...e, fields: fields.map((g, j) => (j === i ? { ...g, inline: x.target.checked } : g)) })} />inline</label>
            <button className="ghost small" onClick={() => set({ ...e, fields: fields.filter((_, j) => j !== i) })} aria-label="ลบ field">×</button>
          </div>
        ))}
        {fields.length < LIMITS.fields && <button className="secondary small" style={{ justifySelf: 'start' }} onClick={() => set({ ...e, fields: [...fields, { name: '', value: '' }] })}>+ Add field</button>}
      </div>
      <div className="inline">
        <div className="field"><label>Image URL</label><input className="input" placeholder="https://" value={e.imageUrl ?? ''} onChange={(x) => set({ ...e, imageUrl: x.target.value })} /></div>
        <div className="field"><label>Thumbnail URL</label><input className="input" placeholder="https://" value={e.thumbnailUrl ?? ''} onChange={(x) => set({ ...e, thumbnailUrl: x.target.value })} /></div>
      </div>
      <div className="inline">
        <div className="field"><label>Footer</label><input className="input" maxLength={LIMITS.footer} value={e.footer?.text ?? ''} onChange={(x) => set({ ...e, footer: { ...e.footer, text: x.target.value } })} /></div>
        <label className="checkrow" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!e.timestamp} onChange={(x) => set({ ...e, timestamp: x.target.checked })} />แสดงเวลา</label>
      </div>
    </div>
  );
}

export function MessageEditor({ value, onChange }: { value: Msg; onChange: (m: Msg) => void }) {
  return (
    <div className="msgeditor">
      <div className="field"><label>Content <span className="sub">{value.content.length}/{LIMITS.content}</span></label>
        <textarea maxLength={LIMITS.content} rows={3} placeholder="ข้อความนอก embed (ไม่บังคับ)" value={value.content} onChange={(e) => onChange({ ...value, content: e.target.value })} />
      </div>
      {value.embeds.map((e, i) => (
        <EmbedEditor key={i} e={e} set={(n) => onChange({ ...value, embeds: value.embeds.map((x, j) => (j === i ? n : x)) })} remove={() => onChange({ ...value, embeds: value.embeds.filter((_, j) => j !== i) })} />
      ))}
      {value.embeds.length < LIMITS.embeds && (
        <button className="secondary small" onClick={() => onChange({ ...value, embeds: [...value.embeds, { color: 0x4cc9e0, fields: [] }] })}>+ Add embed</button>
      )}
    </div>
  );
}

/** Very small Discord markdown: **bold**, *italic*, # headings, role/channel mentions, line breaks. */
export function Md({ text, roleName }: { text: string; roleName?: (id: string) => string | undefined }) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const html = emo(text)
    .split('\n')
    .map((line) => {
      let l = esc(line);
      const h = l.match(/^(#{1,3}) (.*)$/);
      l = (h ? h[2]! : l)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id: string) => `<span class="dmention">@${esc(roleName?.(id) ?? 'role')}</span>`)
        .replace(/&lt;a?:(\w+):\d+&gt;/g, ':$1:');
      return h ? `<span class="dh${h[1]!.length}">${l}</span>` : l;
    })
    .join('<br>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function DiscordPreview({ msg, botName, avatar, children, roleName }: { msg: Msg; botName: string; avatar?: string | null; children?: React.ReactNode; roleName?: (id: string) => string | undefined }) {
  return (
    <div className="dprev">
      <div className="dmsg">
        <span className="dav">{avatar ? <img src={avatar} alt="" /> : botName[0]}</span>
        <div style={{ minWidth: 0 }}>
          <div className="dname"><b>{botName}</b><span className="bt">APP</span><small>วันนี้</small></div>
          {msg.content && <div className="dcontent"><Md text={msg.content} roleName={roleName} /></div>}
          {msg.embeds.map((e, i) => (
            <div className="dembed" key={i} style={{ borderLeftColor: hex(e.color) }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {e.author?.name && <div className="dauthor">{e.author.iconUrl && <img src={e.author.iconUrl} alt="" />}{e.author.name}</div>}
                {e.title && <div className="dtitle">{e.title}</div>}
                {e.description && <div className="ddesc"><Md text={e.description} roleName={roleName} /></div>}
                {!!e.fields?.length && (
                  <div className="dfields">{e.fields.map((f, j) => <div key={j} className={f.inline ? 'inl' : ''}><b>{f.name}</b><Md text={f.value} roleName={roleName} /></div>)}</div>
                )}
                {e.imageUrl && <img className="dimgx" src={e.imageUrl} alt="" />}
                {(e.footer?.text || e.timestamp) && <div className="dfoot">{e.footer?.text}{e.footer?.text && e.timestamp ? ' • ' : ''}{e.timestamp ? 'วันนี้' : ''}</div>}
              </div>
              {e.thumbnailUrl && <img className="dthumb" src={e.thumbnailUrl} alt="" />}
            </div>
          ))}
          {children}
        </div>
      </div>
    </div>
  );
}
