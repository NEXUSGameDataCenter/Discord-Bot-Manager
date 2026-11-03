'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LIMITS,
  BUILTIN_VARIABLES,
  messagePayloadSchema,
  renderPayload,
  totalEmbedLength,
  type Embed,
  type MessagePayload,
} from '@nexus/shared';
import { PageHead, ErrorBox, useToast } from '@/components/Shell';
import { BotPicker } from '@/components/BotPicker';
import { api, useApi } from '@/lib/client';
import type { ChannelRow, GuildRow } from '@/lib/types';

/* ---------- draft types (form state, converted to the zod payload on submit) ---------- */
type FieldDraft = { name: string; value: string; inline: boolean };
type EmbedDraft = {
  title: string; description: string; url: string; color: string;
  authorName: string; authorIcon: string; thumbnailUrl: string; imageUrl: string;
  footer: string; timestamp: boolean; fields: FieldDraft[];
};
type Attachment = { id: string; fileName: string; size: number };
type TargetDraft = {
  guildRefId: string; guildName: string; channelId: string; channelName: string;
  mode: 'BOT' | 'WEBHOOK'; canAttach: boolean; canWebhook: boolean; canMentionEveryone: boolean;
  pingRoleId: string; extraText: string; skip: boolean; webhookName: string; webhookAvatarUrl: string;
};

const newEmbed = (): EmbedDraft => ({ title: 'ประกาศสำคัญ', description: 'รายละเอียดประกาศจะปรากฏที่นี่', url: '', color: '#6366f1', authorName: '', authorIcon: '', thumbnailUrl: '', imageUrl: '', footer: '', timestamp: false, fields: [] });
const opt = (s: string) => (s.trim() ? s.trim() : undefined);

function toEmbed(e: EmbedDraft): Embed {
  return {
    title: opt(e.title), description: opt(e.description), url: opt(e.url),
    color: /^#[0-9a-f]{6}$/i.test(e.color) ? parseInt(e.color.slice(1), 16) : undefined,
    author: opt(e.authorName) ? { name: e.authorName.trim(), iconUrl: opt(e.authorIcon) } : undefined,
    thumbnailUrl: opt(e.thumbnailUrl), imageUrl: opt(e.imageUrl),
    footer: opt(e.footer) ? { text: e.footer.trim() } : undefined,
    timestamp: e.timestamp || undefined,
    fields: e.fields.filter((f) => f.name.trim() && f.value.trim()).map((f) => ({ name: f.name.trim(), value: f.value.trim(), inline: f.inline })),
  };
}

export default function AnnouncementsPage() {
  const toast = useToast();
  const router = useRouter();
  const [step, setStep] = useState(1);
  /* compose */
  const [title, setTitle] = useState('Community Update');
  const [content, setContent] = useState('ประกาศจากทีมงาน {server.name}\n\nขอแจ้งข่าวสารและอัปเดตล่าสุดให้ผู้เล่นทุกท่านทราบ');
  const [embeds, setEmbeds] = useState<EmbedDraft[]>([newEmbed()]);
  const [buttons, setButtons] = useState<{ label: string; url: string }[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /* target */
  const [botId, setBotId] = useState('');
  const [targets, setTargets] = useState<TargetDraft[]>([]);
  const [allowEveryone, setAllowEveryone] = useState(false);
  const [everyoneConfirmed, setEveryoneConfirmed] = useState(false);
  /* review */
  const [timing, setTiming] = useState<'now' | 'at' | 'cron'>('now');
  const [runAt, setRunAt] = useState('');
  const [cron, setCron] = useState('0 9 * * 1');
  const [crosspost, setCrosspost] = useState(false);
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const payload: MessagePayload = useMemo(
    () => ({ content, embeds: embeds.map(toEmbed), buttons: buttons.filter((b) => b.label.trim() && b.url.trim()), attachmentIds: attachments.map((a) => a.id) }),
    [content, embeds, buttons, attachments],
  );
  const parsed = messagePayloadSchema.safeParse(payload);
  const payloadErrors = parsed.success ? [] : parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
  const embedTotal = totalEmbedLength(payload.embeds);
  const active = targets.filter((t) => !t.skip);
  const serverCount = new Set(active.map((t) => t.guildRefId)).size;
  const targetProblems = active.flatMap((t) => [
    payload.attachmentIds.length && !t.canAttach ? `${t.guildName} #${t.channelName}: ขาด Attach Files` : null,
    t.mode === 'WEBHOOK' && !t.canWebhook ? `${t.guildName} #${t.channelName}: ขาด Manage Webhooks` : null,
    t.mode === 'WEBHOOK' && !t.webhookName.trim() ? `${t.guildName} #${t.channelName}: ใส่ชื่อ Webhook` : null,
    allowEveryone && !t.canMentionEveryone ? `${t.guildName} #${t.channelName}: ขาด Mention Everyone` : null,
  ]).filter((x): x is string => !!x);

  function buildBody(list: TargetDraft[], isTest: boolean) {
    const tz = timing === 'at' ? `${runAt}:00+07:00` : '';
    return {
      botId, title, payload, isTest, crosspost, allowEveryone, everyoneConfirmed,
      timing: isTest || timing === 'now' ? { kind: 'now' } : timing === 'at' ? { kind: 'at', runAt: tz } : { kind: 'cron', cron },
      confirmCount: list.filter((t) => !t.skip).length,
      targets: list.map((t) => ({
        guildRefId: t.guildRefId, channelId: t.channelId, mode: t.mode, skip: t.skip,
        pingRoleId: opt(t.pingRoleId), extraText: opt(t.extraText),
        webhookName: t.mode === 'WEBHOOK' ? opt(t.webhookName) : undefined,
        webhookAvatarUrl: t.mode === 'WEBHOOK' ? opt(t.webhookAvatarUrl) : undefined,
      })),
    };
  }

  async function submit() {
    if (!finalConfirm) return toast('กรุณาติ๊กยืนยันก่อนส่ง', true);
    const when = timing === 'now' ? 'ทันที' : timing === 'at' ? `เวลา ${runAt.replace('T', ' ')} (Asia/Bangkok)` : `ตาม cron "${cron}" (Asia/Bangkok)`;
    if (!confirm(`ยืนยันส่งประกาศ "${title}"\n→ ${serverCount} Servers / ${active.length} Channels\n→ ${when}${allowEveryone ? '\n⚠ มี @everyone / @here' : ''}`)) return;
    setSending(true);
    try {
      const r = await api<{ id: string }>('/api/announcements', { body: buildBody(targets, false) });
      toast('Delivery jobs queued');
      router.push(`/tracking/${r.id}`);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSending(false);
    }
  }
  async function testSend(t: TargetDraft) {
    if (!confirm(`Test-send ไปที่ ${t.guildName} #${t.channelName} (1 Server / 1 Channel)?`)) return;
    try {
      const r = await api<{ id: string }>('/api/announcements', { body: { ...buildBody([{ ...t, skip: false }], true), allowEveryone: false, everyoneConfirmed: false } });
      toast('Test send queued');
      window.open(`/tracking/${r.id}`, '_blank');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <>
      <PageHead crumb="ANNOUNCEMENTS" title="Announcements" sub="สร้างและส่งประกาศไปยังหลายเซิร์ฟเวอร์" />
      <div className="stepper">
        {['1. Compose', '2. Target', '3. Review'].map((x, i) => (
          <div key={x} className={`step ${step === i + 1 ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setStep(i + 1)}>{x}</div>
        ))}
      </div>

      {step === 1 && (
        <>
          <div className="split">
            <Composer {...{ title, setTitle, content, setContent, embeds, setEmbeds, buttons, setButtons, attachments, setAttachments, embedTotal, payloadErrors }} />
            <Preview payload={payload} sample={targets[0]} attachments={attachments} />
          </div>
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button disabled={!!payloadErrors.length} onClick={() => setStep(2)}>Continue to Target Selection →</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <TargetPicker {...{ botId, setBotId, targets, setTargets, hasFiles: attachments.length > 0 }} />
          <section className="card" style={{ marginTop: 14 }}>
            <h3>Mention Safety</h3>
            <label className="checkrow">
              <input
                type="checkbox"
                checked={allowEveryone}
                onChange={(e) => {
                  if (e.target.checked) {
                    const ok = confirm(`⚠ เปิด @everyone / @here?\nข้อความจะ ping สมาชิกทุกคนใน ${serverCount} Servers ที่เลือก`);
                    setAllowEveryone(ok);
                    setEveryoneConfirmed(ok);
                  } else {
                    setAllowEveryone(false);
                    setEveryoneConfirmed(false);
                  }
                }}
              />{' '}
              Allow @everyone / @here (extra confirmation required)
            </label>
            <div className="notice">Mention ทุกประเภทถูกปิดโดยค่าเริ่มต้น (allowedMentions ถูกตั้งค่าเสมอ) · Role ping ใช้ได้เฉพาะ Role ID ที่ใส่ใน Override ของแต่ละ Server</div>
          </section>
          <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <button className="secondary" onClick={() => setStep(1)}>← Back</button>
            <button disabled={!active.length} onClick={() => setStep(3)}>Review Targets ({active.length}) →</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <section className="card">
            <h3>Review &amp; Confirmation</h3>
            <div className="grid three">
              <div><small className="muted">Target Servers</small><h2>{serverCount}</h2></div>
              <div><small className="muted">Channels</small><h2>{active.length}</h2></div>
              <div><small className="muted">Timezone</small><h2>UTC+7</h2></div>
            </div>
            <ErrorBox error={[...payloadErrors, ...targetProblems].join(' · ') || undefined} />
            <hr style={{ borderColor: 'var(--line)' }} />
            <div className="field">
              <label>Send Timing</label>
              <select value={timing} onChange={(e) => setTiming(e.target.value as typeof timing)}>
                <option value="now">Send Now</option>
                <option value="at">Schedule Date &amp; Time</option>
                <option value="cron">Repeat Schedule (Cron)</option>
              </select>
            </div>
            {timing === 'at' && (
              <div className="field"><label>Scheduled time (Asia/Bangkok)</label><input className="input" type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} /></div>
            )}
            {timing === 'cron' && (
              <div className="field">
                <label>Cron (minute hour day month weekday · Asia/Bangkok)</label>
                <input className="input" value={cron} onChange={(e) => setCron(e.target.value)} />
                <small className="sub">ตัวอย่าง: <code>0 9 * * 1</code> = ทุกวันจันทร์ 09:00 · <code>0 12 1 * *</code> = วันที่ 1 ของทุกเดือน 12:00</small>
              </div>
            )}
            <label className="checkrow"><input type="checkbox" checked={crosspost} onChange={(e) => setCrosspost(e.target.checked)} /> Auto-publish (crosspost) ในห้อง Announcement</label>
            <details>
              <summary>Test-send to a sandbox channel first</summary>
              {targets.map((t) => (
                <div className="row" key={`${t.guildRefId}:${t.channelId}`} style={{ padding: '4px 0' }}>
                  <span className="grow sub">{t.guildName} · #{t.channelName}</span>
                  <button className="secondary small" onClick={() => testSend(t)}>Test send here</button>
                </div>
              ))}
            </details>
            <div className="notice">ยืนยันการส่งไปยัง {serverCount} Servers และ {active.length} Channels ก่อนดำเนินการ</div>
            <label className="checkrow"><input type="checkbox" checked={finalConfirm} onChange={(e) => setFinalConfirm(e.target.checked)} /> ฉันตรวจสอบปลายทางและเนื้อหาเรียบร้อยแล้ว</label>
            <button disabled={sending || !active.length || !!payloadErrors.length || !!targetProblems.length || (timing === 'at' && !runAt)} onClick={submit}>
              ➤ {timing === 'now' ? 'Queue Announcement' : 'Schedule Announcement'}
            </button>
          </section>
          <div className="toolbar" style={{ marginTop: 14 }}><button className="secondary" onClick={() => setStep(2)}>← Back to Targets</button></div>
        </>
      )}
    </>
  );
}

/* ---------------------------------- Compose ---------------------------------- */
function Composer(p: {
  title: string; setTitle: (s: string) => void; content: string; setContent: (s: string) => void;
  embeds: EmbedDraft[]; setEmbeds: (e: EmbedDraft[]) => void; buttons: { label: string; url: string }[]; setButtons: (b: { label: string; url: string }[]) => void;
  attachments: Attachment[]; setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>; embedTotal: number; payloadErrors: string[];
}) {
  const toast = useToast();
  const [showVars, setShowVars] = useState(false);
  const upd = (i: number, patch: Partial<EmbedDraft>) => p.setEmbeds(p.embeds.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  async function upload(files: FileList | null) {
    let count = p.attachments.length;
    for (const f of Array.from(files ?? [])) {
      if (count >= LIMITS.attachments) return toast(`แนบได้สูงสุด ${LIMITS.attachments} ไฟล์`, true);
      count++;
      const fd = new FormData();
      fd.append('kind', 'attachment');
      fd.append('file', f);
      try {
        const { asset } = await api<{ asset: Attachment }>('/api/assets', { body: fd });
        p.setAttachments((prev) => [...prev, asset]); // functional update: several files upload in one loop
      } catch (e) {
        toast((e as Error).message, true);
      }
    }
  }

  return (
    <section className="card">
      <div className="field"><label>Internal title (ไม่แสดงใน Discord)</label><input className="input" maxLength={100} value={p.title} onChange={(e) => p.setTitle(e.target.value)} /></div>
      <h3>Message Content</h3>
      <div className="field">
        <textarea maxLength={LIMITS.content} value={p.content} onChange={(e) => p.setContent(e.target.value)} />
        <small className={`counter ${p.content.length > LIMITS.content ? 'over' : ''}`}>{p.content.length} / {LIMITS.content}</small>
      </div>
      <hr style={{ borderColor: 'var(--line)' }} />
      <div className="switchline">
        <h3>Rich Embed Builder ({p.embeds.length}/{LIMITS.embeds})</h3>
        <small className={`counter ${p.embedTotal > LIMITS.embedTotal ? 'over' : ''}`}>{p.embedTotal} / {LIMITS.embedTotal} combined</small>
      </div>
      {p.embeds.map((e, i) => (
        <details key={i} open={i === p.embeds.length - 1} className="targetrow" style={{ display: 'block' }}>
          <summary>Embed #{i + 1} {e.title && `· ${e.title}`}</summary>
          <div className="inline">
            <div className="field"><label>Title</label><input className="input" maxLength={LIMITS.title} value={e.title} onChange={(x) => upd(i, { title: x.target.value })} /></div>
            <div className="field"><label>URL</label><input className="input" placeholder="https://" value={e.url} onChange={(x) => upd(i, { url: x.target.value })} /></div>
            <div className="field"><label>Color</label><input className="input" type="color" value={e.color} onChange={(x) => upd(i, { color: x.target.value })} /></div>
          </div>
          <div className="field"><label>Description</label><textarea maxLength={LIMITS.description} value={e.description} onChange={(x) => upd(i, { description: x.target.value })} /></div>
          <div className="inline">
            <div className="field"><label>Author name</label><input className="input" value={e.authorName} onChange={(x) => upd(i, { authorName: x.target.value })} /></div>
            <div className="field"><label>Author icon URL</label><input className="input" value={e.authorIcon} onChange={(x) => upd(i, { authorIcon: x.target.value })} /></div>
            <div className="field"><label>Thumbnail URL</label><input className="input" value={e.thumbnailUrl} onChange={(x) => upd(i, { thumbnailUrl: x.target.value })} /></div>
            <div className="field"><label>Image URL</label><input className="input" value={e.imageUrl} onChange={(x) => upd(i, { imageUrl: x.target.value })} /></div>
            <div className="field"><label>Footer</label><input className="input" maxLength={LIMITS.footer} value={e.footer} onChange={(x) => upd(i, { footer: x.target.value })} /></div>
          </div>
          <label className="checkrow"><input type="checkbox" checked={e.timestamp} onChange={(x) => upd(i, { timestamp: x.target.checked })} /> Timestamp (เวลาที่ส่ง)</label>
          {e.fields.map((f, k) => (
            <div className="row" key={k}>
              <input className="input grow" placeholder="Field name" value={f.name} onChange={(x) => upd(i, { fields: e.fields.map((ff, kk) => (kk === k ? { ...ff, name: x.target.value } : ff)) })} />
              <input className="input grow" placeholder="Field value" value={f.value} onChange={(x) => upd(i, { fields: e.fields.map((ff, kk) => (kk === k ? { ...ff, value: x.target.value } : ff)) })} />
              <label className="checkrow"><input type="checkbox" checked={f.inline} onChange={(x) => upd(i, { fields: e.fields.map((ff, kk) => (kk === k ? { ...ff, inline: x.target.checked } : ff)) })} /> inline</label>
              <button className="ghost small" onClick={() => upd(i, { fields: e.fields.filter((_, kk) => kk !== k) })}>✕</button>
            </div>
          ))}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="secondary small" disabled={e.fields.length >= LIMITS.fields} onClick={() => upd(i, { fields: [...e.fields, { name: '', value: '', inline: false }] })}>＋ Field</button>
            <button className="danger small" onClick={() => p.setEmbeds(p.embeds.filter((_, j) => j !== i))}>Remove embed</button>
          </div>
        </details>
      ))}
      {p.buttons.map((b, i) => (
        <div className="row" key={i} style={{ marginTop: 6 }}>
          <input className="input grow" placeholder="Button label" maxLength={LIMITS.buttonLabel} value={b.label} onChange={(x) => p.setButtons(p.buttons.map((bb, j) => (j === i ? { ...bb, label: x.target.value } : bb)))} />
          <input className="input grow" placeholder="https://" value={b.url} onChange={(x) => p.setButtons(p.buttons.map((bb, j) => (j === i ? { ...bb, url: x.target.value } : bb)))} />
          <button className="ghost small" onClick={() => p.setButtons(p.buttons.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {p.attachments.map((a) => (
        <div className="row" key={a.id} style={{ marginTop: 6 }}>
          <span className="grow sub">📎 {a.fileName} · {(a.size / 1024).toFixed(0)} KB</span>
          <button className="ghost small" onClick={() => p.setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>✕</button>
        </div>
      ))}
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button className="secondary small" disabled={p.embeds.length >= LIMITS.embeds} onClick={() => p.setEmbeds([...p.embeds, newEmbed()])}>＋ Add Embed</button>
        <button className="secondary small" disabled={p.buttons.length >= LIMITS.buttons} onClick={() => p.setButtons([...p.buttons, { label: '', url: '' }])}>↗ Link Button</button>
        <label className="secondary small" style={{ cursor: 'pointer', padding: '6px 9px', borderRadius: 9, background: '#202e49', border: '1px solid #35445f', fontSize: 12 }}>
          📎 Attachment<input type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        </label>
        <button className="secondary small" onClick={() => setShowVars(!showVars)}>{'{ }'} Variables</button>
      </div>
      {showVars && (
        <div className="notice" style={{ background: '#202d53', color: '#c7d2fe' }}>
          {BUILTIN_VARIABLES.map((v) => <code key={v} style={{ marginRight: 6 }}>{v}</code>)} + ตัวแปรของแต่ละ Server เช่น <code>{'{event}'}</code> (ตั้งที่หน้า จัดการ Servers)
        </div>
      )}
      <small className="sub">Message limit 2,000 · Combined embed limit 6,000 · Up to 10 embeds</small>
      {p.payloadErrors.length > 0 && <div className="err">{p.payloadErrors.join(' · ')}</div>}
    </section>
  );
}

function Preview({ payload, sample, attachments }: { payload: MessagePayload; sample?: TargetDraft; attachments: Attachment[] }) {
  const r = renderPayload(payload, {
    server: { name: sample?.guildName ?? 'Server Name', memberCount: 1234 },
    channel: { name: sample?.channelName ?? 'announcements' },
    date: new Date(),
  });
  const time = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date());
  return (
    <section className="card">
      <h3>Discord Live Preview {sample && <small className="muted">· {sample.guildName}</small>}</h3>
      <div className="preview">
        <div className="botrow" style={{ paddingTop: 0, border: 0 }}>
          <div className="boticon">♟</div>
          <div><strong>{sample?.mode === 'WEBHOOK' ? sample.webhookName || 'Webhook' : 'Nexus Bot'} <span className="status info">{sample?.mode === 'WEBHOOK' ? 'APP' : 'BOT'}</span></strong><small>Today at {time}</small></div>
        </div>
        {sample?.pingRoleId && <p className="sub">@role</p>}
        {sample?.extraText && <p style={{ whiteSpace: 'pre-wrap' }}>{sample.extraText}</p>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{r.content}</p>
        {r.embeds.map((e, i) => (
          <div className="discordembed" key={i} style={{ borderLeftColor: e.color !== undefined ? `#${e.color.toString(16).padStart(6, '0')}` : undefined, overflow: 'hidden' }}>
            {e.thumbnailUrl && <img className="embedthumb" src={e.thumbnailUrl} alt="" />}
            {e.author && <small style={{ display: 'block' }}>{e.author.name}</small>}
            {e.title && <strong>{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}</strong>}
            {e.description && <p style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}
            {!!e.fields?.length && (
              <div className="embedfields">
                {e.fields.map((f, k) => <div key={k} className={f.inline ? 'inl' : ''}><strong style={{ fontSize: 12 }}>{f.name}</strong><p style={{ margin: 0 }}>{f.value}</p></div>)}
              </div>
            )}
            {e.imageUrl && <img className="embedimg" src={e.imageUrl} alt="" />}
            {(e.footer || e.timestamp) && <small className="muted" style={{ display: 'block', clear: 'both' }}>{e.footer?.text}{e.footer && e.timestamp ? ' • ' : ''}{e.timestamp ? `Today at ${time}` : ''}</small>}
          </div>
        ))}
        {!!r.buttons.length && <div className="btnrow">{r.buttons.map((b, i) => <span className="dbtn" key={i}>{b.label} ↗</span>)}</div>}
        {attachments.map((a) => <div key={a.id} className="sub">📎 {a.fileName}</div>)}
      </div>
    </section>
  );
}

/* ---------------------------------- Targeting ---------------------------------- */
function TargetPicker({ botId, setBotId, targets, setTargets, hasFiles }: {
  botId: string; setBotId: (s: string) => void; targets: TargetDraft[]; setTargets: (t: TargetDraft[]) => void; hasFiles: boolean;
}) {
  const toast = useToast();
  const guilds = useApi<{ guilds: GuildRow[] }>(botId ? `/api/guilds?botId=${botId}` : null);
  const groups = useApi<{ groups: { id: string; name: string; guildRefIds: string[] }[] }>('/api/target-groups');
  const [guildRefId, setGuildRefId] = useState('');
  const [mode, setMode] = useState<'BOT' | 'WEBHOOK'>('BOT');
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [channelId, setChannelId] = useState('');
  const guild = guilds.data?.guilds.find((g) => g.id === guildRefId);

  // Load channel dropdown whenever server / mode / attachment need changes. Only sendable channels come back.
  useEffect(() => {
    setChannels(null);
    setChannelId('');
    if (!guildRefId) return;
    api<{ defaultChannelId: string | null; channels: ChannelRow[] }>(`/api/guilds/${guildRefId}/channels?attachments=${hasFiles ? 1 : 0}&webhook=${mode === 'WEBHOOK' ? 1 : 0}`)
      .then((r) => {
        setChannels(r.channels);
        setChannelId(r.channels.some((c) => c.channelId === r.defaultChannelId) ? r.defaultChannelId! : (r.channels[0]?.channelId ?? ''));
      })
      .catch((e: Error) => toast(e.message, true));
  }, [guildRefId, mode, hasFiles, toast]);

  const exists = (g: string, c: string) => targets.some((t) => t.guildRefId === g && t.channelId === c);
  const draft = (g: GuildRow, c: { channelId: string; name: string; canAttach?: boolean; canWebhook?: boolean; canMentionEveryone?: boolean }, m: 'BOT' | 'WEBHOOK'): TargetDraft => ({
    guildRefId: g.id, guildName: g.name, channelId: c.channelId, channelName: c.name, mode: m,
    canAttach: c.canAttach ?? false, canWebhook: c.canWebhook ?? false, canMentionEveryone: c.canMentionEveryone ?? false,
    pingRoleId: '', extraText: '', skip: false, webhookName: m === 'WEBHOOK' ? 'Nexus News' : '', webhookAvatarUrl: '',
  });

  function add() {
    const c = channels?.find((x) => x.channelId === channelId);
    if (!guild || !c) return;
    if (exists(guild.id, c.channelId)) return toast('ห้องนี้ถูกเลือกไว้แล้ว', true);
    setTargets([...targets, draft(guild, c, mode)]);
    setGuildRefId('');
  }
  /** Add servers by their default announcement channel (used by "all" and target groups). */
  async function addDefaults(ids: string[]) {
    const list = guilds.data?.guilds.filter((g) => ids.includes(g.id)) ?? [];
    const added: TargetDraft[] = [];
    let skipped = 0;
    for (const g of list) {
      if (!g.defaultChannelId) { skipped++; continue; }
      const r = await api<{ channels: ChannelRow[] }>(`/api/guilds/${g.id}/channels?attachments=${hasFiles ? 1 : 0}`);
      const c = r.channels.find((x) => x.channelId === g.defaultChannelId);
      if (!c || exists(g.id, c.channelId)) { skipped++; continue; }
      added.push(draft(g, c, 'BOT'));
    }
    setTargets([...targets, ...added]);
    toast(`เพิ่ม ${added.length} ปลายทาง${skipped ? ` · ข้าม ${skipped} (ไม่มีห้องเริ่มต้น/ซ้ำ/ขาดสิทธิ์)` : ''}`, skipped > 0 && !added.length);
  }
  async function saveGroup() {
    const ids = [...new Set(targets.map((t) => t.guildRefId))];
    const name = prompt(`บันทึก ${ids.length} Servers เป็น Target Group ชื่อ:`);
    if (!name) return;
    try {
      await api('/api/target-groups', { body: { name, guildRefIds: ids } });
      groups.reload();
      toast('บันทึก Target Group แล้ว');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  const patch = (i: number, p: Partial<TargetDraft>) => setTargets(targets.map((t, j) => (j === i ? { ...t, ...p } : t)));

  const grouped = useMemo(() => {
    const m = new Map<string, ChannelRow[]>();
    for (const c of channels ?? []) m.set(c.parentName ?? 'No category', [...(m.get(c.parentName ?? 'No category') ?? []), c]);
    return [...m.entries()];
  }, [channels]);

  return (
    <section className="card">
      <h3>Select Target Servers &amp; Channels</h3>
      <p className="sub">ข้อมูล Server และห้องดึงจาก Discord ที่เชื่อมต่อแล้ว · แสดงเฉพาะห้องที่ Bot มี ViewChannel, SendMessages และ EmbedLinks{hasFiles ? ' + AttachFiles' : ''}{mode === 'WEBHOOK' ? ' + ManageWebhooks' : ''}</p>
      <ErrorBox error={guilds.error} />
      <div className="field"><label>Bot</label><BotPicker value={botId} onChange={(id) => { setBotId(id); setTargets([]); setGuildRefId(''); }} /></div>
      <div className="inline">
        <div className="field">
          <label>Server</label>
          <select value={guildRefId} onChange={(e) => setGuildRefId(e.target.value)} disabled={!guilds.data}>
            <option value="">{guilds.loading ? 'Loading servers…' : `— เลือก Server (${guilds.data?.guilds.length ?? 0}) —`}</option>
            {guilds.data?.guilds.map((g) => (
              <option key={g.id} value={g.id} disabled={!g.sendableChannels.length}>
                {g.name}{!g.sendableChannels.length ? ' (ไม่มีห้องที่ส่งได้)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Channel Selection</label>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} disabled={!guildRefId || !channels}>
            {!guildRefId && <option value="">— เลือก Server ก่อน —</option>}
            {guildRefId && !channels && <option value="">Loading channels…</option>}
            {channels && !channels.length && <option value="">ไม่มีห้องที่ Bot ส่งได้</option>}
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((c) => (
                  <option key={c.channelId} value={c.channelId} disabled={exists(guildRefId, c.channelId)}>
                    {c.type === 5 ? '📢' : '#'} {c.name}{c.channelId === guild?.defaultChannelId ? ' (default)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Delivery Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'BOT' | 'WEBHOOK')}>
            <option value="BOT">As the Bot (Server Identity)</option>
            <option value="WEBHOOK">Webhook (Custom Identity)</option>
          </select>
        </div>
      </div>
      <div className="toolbar">
        <button disabled={!channelId} onClick={add}>＋ Add Target</button>
        <button className="secondary small" disabled={!guilds.data?.guilds.length} onClick={() => addDefaults(guilds.data!.guilds.map((g) => g.id))}>＋ All servers (default channel)</button>
        <select style={{ width: 'auto' }} value="" onChange={(e) => { const g = groups.data?.groups.find((x) => x.id === e.target.value); if (g) void addDefaults(g.guildRefIds); }}>
          <option value="">Load Target Group…</option>
          {groups.data?.groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.guildRefIds.length})</option>)}
        </select>
        <button className="secondary small" disabled={!targets.length} onClick={saveGroup}>Save as Group</button>
        {!!targets.length && <button className="ghost small" onClick={() => setTargets([])}>Clear</button>}
      </div>

      <h3 style={{ marginTop: 14 }}>Targets ({targets.filter((t) => !t.skip).length} active / {targets.length})</h3>
      {!targets.length && <p className="sub">ยังไม่ได้เลือกปลายทาง</p>}
      {targets.map((t, i) => (
        <div className="targetrow" key={`${t.guildRefId}:${t.channelId}`} style={t.skip ? { opacity: 0.5 } : undefined}>
          <div>
            <strong style={{ fontSize: 12 }}>{t.guildName}</strong> <span className="sub">· #{t.channelName} · {t.mode === 'BOT' ? 'Bot identity' : 'Webhook'}</span>
            {hasFiles && !t.canAttach && <div className="err">ห้องนี้ขาด Attach Files</div>}
            <details>
              <summary>Per-server overrides</summary>
              <div className="inline">
                <div className="field"><label>Role ID to ping</label><input className="input" inputMode="numeric" placeholder="123456789012345678" value={t.pingRoleId} onChange={(e) => patch(i, { pingRoleId: e.target.value.replace(/\D/g, '') })} /></div>
                <div className="field"><label>Extra text</label><input className="input" maxLength={500} value={t.extraText} onChange={(e) => patch(i, { extraText: e.target.value })} /></div>
                {t.mode === 'WEBHOOK' && (
                  <>
                    <div className="field"><label>Webhook name</label><input className="input" maxLength={80} value={t.webhookName} onChange={(e) => patch(i, { webhookName: e.target.value })} /></div>
                    <div className="field"><label>Webhook avatar URL (public)</label><input className="input" placeholder="https://" value={t.webhookAvatarUrl} onChange={(e) => patch(i, { webhookAvatarUrl: e.target.value })} /></div>
                  </>
                )}
              </div>
              <label className="checkrow"><input type="checkbox" checked={t.skip} onChange={(e) => patch(i, { skip: e.target.checked })} /> Skip this server</label>
            </details>
          </div>
          <button className="ghost small" onClick={() => setTargets(targets.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
    </section>
  );
}
