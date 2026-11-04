'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { AuditRow } from '@/lib/types';

export type Cat = 'ann' | 'team' | 'bot' | 'server' | 'mod' | 'sys';
export const CATS: Record<Cat, { label: string; color: string }> = {
  ann: { label: '📢 ประกาศ', color: '#f472b6' },
  team: { label: '👥 ทีม', color: '#34d399' },
  bot: { label: '🤖 Bot', color: '#38e1ff' },
  server: { label: '🖥 Server', color: '#60a5fa' },
  mod: { label: '🛡 Moderation', color: '#a78bfa' },
  sys: { label: '⚙ ระบบ', color: '#fbbf24' },
};
type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'grey';
type View = { cat: Cat; icon: string; text: React.ReactNode; tone: Tone; label: string; bar?: number; link?: string };

const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const B = ({ children }: { children: React.ReactNode }) => <b>{children}</b>;
const ROLE: Record<string, string> = { OWNER: 'Owner', ADMIN: 'Admin', EDITOR: 'Editor' };

/** Turns a raw audit row into a readable Thai sentence with a live status. */
export function describe(l: AuditRow): View {
  const t = l.targets ?? {};
  const d = (l.detail ?? {}) as Record<string, unknown>;
  const name = s(t.name) || s(t.username);
  const ann = l.ann;
  const annTitle = ann?.title ?? 'ประกาศ';
  const plain: Tone = l.result === 'failed' ? 'bad' : l.result === 'partial' ? 'warn' : 'ok';
  const done = (label = 'สำเร็จ'): Pick<View, 'tone' | 'label'> => ({ tone: plain, label: l.result === 'failed' ? 'ล้มเหลว' : l.result === 'partial' ? 'สำเร็จบางส่วน' : label });
  const link = typeof t.announcementId === 'string' ? `/tracking/${t.announcementId}` : undefined;

  /** Live result of a send, from the announcement's latest run. */
  const sendState = (): Pick<View, 'tone' | 'label' | 'bar'> => {
    if (!ann) return { tone: 'grey', label: 'ไม่พบประกาศแล้ว' };
    if (ann.deleted && !ann.sent && !ann.queued) return { tone: 'grey', label: `ลบแล้ว ${ann.deleted}/${ann.total}` };
    const bar = ann.total ? ann.sent / ann.total : 0;
    if (ann.queued) return { tone: 'info', label: `กำลังส่ง ${ann.sent}/${ann.total}`, bar };
    if (ann.failed && !ann.sent) return { tone: 'bad', label: `ล้มเหลว 0/${ann.total}`, bar };
    if (ann.failed) return { tone: 'warn', label: `สำเร็จบางส่วน ${ann.sent}/${ann.total}`, bar };
    return { tone: 'ok', label: `ส่งสำเร็จ ${ann.sent}/${ann.total}`, bar };
  };

  switch (l.action) {
    case 'announcement.create':
    case 'announcement.test':
      return {
        cat: 'ann', icon: l.action === 'announcement.test' ? '🧪' : '📢', link, ...sendState(),
        text: <>{l.action === 'announcement.test' ? 'ทดสอบส่ง' : 'ส่งประกาศ'} <B>{annTitle}</B> → {s(t.servers)} Server · {s(t.channels)} ห้อง{d.allowEveryone ? <> · <b style={{ color: '#fbbf24' }}>@everyone</b></> : null}</>,
      };
    case 'announcement.deleteEverywhere':
      return { cat: 'ann', icon: '🧹', link, text: <>ลบประกาศ <B>{annTitle}</B> ออกจากทุกห้อง</>, ...(ann && ann.deleted ? { tone: 'grey' as Tone, label: `ลบแล้ว ${ann.deleted}/${s(t.messages) || ann.deleted}` } : { tone: 'info' as Tone, label: 'กำลังลบ…' }) };
    case 'announcement.editEverywhere':
      return { cat: 'ann', icon: '✏️', link, text: <>แก้ไขประกาศ <B>{annTitle}</B> ในทุกห้อง ({s(t.messages)} ข้อความ)</>, tone: 'ok', label: 'ส่งคำสั่งแล้ว' };
    case 'announcement.retryFailed':
      return { cat: 'ann', icon: '🔁', link, text: <>ส่งซ้ำห้องที่ล้มเหลวของ <B>{annTitle}</B> ({s(t.channels)} ห้อง)</>, ...sendState() };
    case 'announcement.delete.result':
    case 'announcement.edit.result':
      return { cat: 'ann', icon: '📋', link, text: <>ผล{l.action.includes('delete') ? 'การลบ' : 'การแก้ไข'}ประกาศ <B>{annTitle}</B>: สำเร็จ {s(d.ok)} · ล้มเหลว {s(d.failed) || '0'}</>, ...done() };
    case 'schedule.pause':
    case 'schedule.resume':
    case 'schedule.delete':
      return { cat: 'ann', icon: '🗓', link, text: <>{l.action === 'schedule.pause' ? 'หยุดตารางเวลา' : l.action === 'schedule.resume' ? 'เปิดตารางเวลา' : 'ลบตารางเวลา'} ของ <B>{annTitle}</B></>, ...done() };
    case 'targetGroup.save':
      return { cat: 'ann', icon: '🎯', text: <>บันทึก Target Group ({s(t.servers)} Servers)</>, ...done() };
    case 'targetGroup.delete':
      return { cat: 'ann', icon: '🎯', text: <>ลบ Target Group <B>{name}</B></>, ...done() };
    case 'team.approve':
      return { cat: 'team', icon: '✅', text: <>อนุมัติ <B>{s(t.email)}</B> เป็น <B>{ROLE[s(t.role)] ?? s(t.role)}</B></>, ...done() };
    case 'team.invite':
      return { cat: 'team', icon: '✉️', text: <>เชิญ <B>{s(t.email)}</B> เป็น <B>{ROLE[s(t.role)] ?? s(t.role)}</B></>, ...done() };
    case 'team.reject':
      return { cat: 'team', icon: '⛔', text: <>ปฏิเสธคำขอของ <B>{s(t.email)}</B></>, ...done() };
    case 'team.remove':
      return { cat: 'team', icon: '🚪', text: <>นำ <B>{s(t.email)}</B> ออกจากทีม</>, ...done() };
    case 'team.update':
      return { cat: 'team', icon: '🛠', text: <>แก้ไขสิทธิ์ของ <B>{s(t.email)}</B>{d.role ? <> เป็น <B>{ROLE[s(d.role)] ?? s(d.role)}</B></> : null}</>, ...done() };
    case 'team.newInviteLink':
      return { cat: 'team', icon: '🔗', text: <>สร้างลิงก์เชิญใหม่ให้ <B>{s(t.email)}</B></>, ...done() };
    case 'me.updateProfile':
      return { cat: 'team', icon: '🪪', text: d.name ? <>เปลี่ยนชื่อโปรไฟล์เป็น <B>{s(d.name)}</B></> : <>แก้ไขโปรไฟล์</>, ...done() };
    case 'me.changePassword':
      return { cat: 'team', icon: '🔑', text: <>เปลี่ยนรหัสผ่าน</>, ...done() };
    case 'bot.add':
      return { cat: 'bot', icon: '🤖', text: <>เพิ่ม Bot <B>{name}</B></>, ...done() };
    case 'bot.remove':
      return { cat: 'bot', icon: '🗑', text: <>ลบ Bot <B>{name}</B></>, ...done() };
    case 'bot.start':
    case 'bot.stop':
    case 'bot.restart':
      return { cat: 'bot', icon: '⏻', text: <>{l.action === 'bot.start' ? 'เปิด' : l.action === 'bot.stop' ? 'ปิด' : 'รีสตาร์ท'} Bot <B>{name}</B></>, tone: 'ok', label: 'ส่งคำสั่งแล้ว' };
    case 'bot.refresh':
      return { cat: 'bot', icon: '🔄', text: <>รีเฟรชข้อมูล Bot <B>{name}</B></>, tone: 'ok', label: 'ส่งคำสั่งแล้ว' };
    case 'bot.editGlobal':
      return { cat: 'bot', icon: '🪪', text: <>แก้ไขโปรไฟล์หลักของ Bot <B>{name}</B></>, tone: 'ok', label: 'ส่งคำสั่งแล้ว' };
    case 'guilds.healthcheck':
      return { cat: 'server', icon: '🔄', text: <>ตรวจสอบ Servers ใหม่</>, tone: 'ok', label: 'ส่งคำสั่งแล้ว' };
    case 'guild.update':
      return { cat: 'server', icon: '🖥', text: <>แก้ไขการตั้งค่า <B>{name}</B></>, ...done() };
    case 'guild.settings':
      return { cat: 'mod', icon: '⚙️', text: <>บันทึกการตั้งค่าโมดูลของ <B>{name}</B></>, ...done() };
    case 'guild.leave':
      return { cat: 'server', icon: '🚪', text: <>ให้ Bot ออกจาก <B>{name}</B></>, tone: 'ok', label: 'ส่งคำสั่งแล้ว' };
    case 'honeypot.createChannel':
      return { cat: 'mod', icon: '🍯', text: <>สร้างห้อง Honeypot ใน <B>{name}</B></>, tone: 'ok', label: 'ส่งคำสั่งแล้ว' };
    case 'roleMenu.create':
    case 'roleMenu.update':
    case 'roleMenu.delete':
      return { cat: 'mod', icon: '🎭', text: <>{l.action === 'roleMenu.create' ? 'สร้าง' : l.action === 'roleMenu.update' ? 'แก้ไข' : 'ลบ'} Reaction Role menu</>, ...(l.result === 'queued' ? { tone: 'ok' as Tone, label: 'ส่งคำสั่งแล้ว' } : done()) };
    default:
      return { cat: 'sys', icon: '•', text: <code>{l.action}</code>, ...(l.result === 'queued' ? { tone: 'ok' as Tone, label: 'ส่งคำสั่งแล้ว' } : done(l.result)) };
  }
}

const fmtFull = (d: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(d));
const fmtTime = (d: string) => new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(d));
function ago(d: string) {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 6e4);
  return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชม.ที่แล้ว` : '';
}
const dayKey = (d: string | number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(d));
export function dayLabel(d: string) {
  const k = dayKey(d);
  if (k === dayKey(Date.now())) return 'วันนี้';
  if (k === dayKey(Date.now() - 864e5)) return 'เมื่อวาน';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(d));
}

const LABELS: Record<string, string> = { servers: 'Servers', channels: 'ห้อง', messages: 'ข้อความ', email: 'Email เป้าหมาย', role: 'Role', name: 'ชื่อ', username: 'Bot', ok: 'สำเร็จ', failed: 'ล้มเหลว', timing: 'เวลา', allowEveryone: '@everyone', defaultChannelId: 'ห้องประกาศหลัก (ID)', channel: 'ห้อง', avatar: 'เปลี่ยนรูป' };
const HIDE = new Set(['announcementId', 'botId', 'guildRefId', 'memberId', 'menuId', 'presetId', 'groupId', 'scheduleId']);
function val(k: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'ใช่' : 'ไม่';
  if (k === 'timing' && v && typeof v === 'object') return (v as { kind?: string }).kind === 'now' ? 'ส่งทันที' : 'ตั้งเวลา';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function ActivityRow({ row, showEmail }: { row: AuditRow; showEmail?: boolean }) {
  const [open, setOpen] = useState(false);
  const v = describe(row);
  const c = CATS[v.cat].color;
  const who = row.actor === 'system' ? 'ระบบอัตโนมัติ' : row.actorName || row.actorEmail || row.actor;
  const extra = [...Object.entries(row.targets ?? {}), ...Object.entries(row.detail ?? {})].filter(([k, x]) => !HIDE.has(k) && x !== null && x !== undefined && x !== '');
  const a = row.ann;
  const since = ago(row.createdAt);
  return (
    <>
      <button className="arow" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="aico" style={{ '--c': c } as React.CSSProperties}>{v.icon}</span>
        <span className="awhat">
          <span className="at">{v.text}</span>
          <span className="am">
            <span className="aav">{(who[0] ?? '?').toUpperCase()}</span>
            <b>{who}</b>
            {showEmail && row.actorEmail && row.actorName && <span>{row.actorEmail}</span>}
            <span>·</span>
            <span style={{ color: c }}>{CATS[v.cat].label}</span>
          </span>
        </span>
        <span className="aright">
          <span className={`ast ${v.tone}`}>{v.label}</span>
          {v.bar !== undefined && <span className="amini"><i style={{ width: `${v.bar * 100}%`, background: `var(--t-${v.tone})` }} /></span>}
          <span className="atime">{fmtTime(row.createdAt)}{since && ` · ${since}`}</span>
        </span>
      </button>
      {open && (
        <div className="adetail">
          <dl>
            <dt>เวลา</dt><dd>{fmtFull(row.createdAt)}</dd>
            <dt>โดย</dt><dd>{who}</dd>
            <dt>Email</dt><dd>{row.actorEmail ?? '— (ระบบอัตโนมัติ)'}</dd>
            {a && (
              <>
                <dt>ผลการส่ง</dt>
                <dd>ส่งสำเร็จ {a.sent} · ล้มเหลว {a.failed} · รอส่ง {a.queued}{a.deleted ? ` · ลบแล้ว ${a.deleted}` : ''} (จาก {a.total} ห้อง)</dd>
              </>
            )}
            {extra.map(([k, x]) => (
              <span key={k} style={{ display: 'contents' }}><dt>{LABELS[k] ?? k}</dt><dd>{val(k, x)}</dd></span>
            ))}
            <dt>Action</dt><dd><code>{row.action}</code></dd>
          </dl>
          {v.link && <Link href={v.link} className="alink">ดูผลการส่ง →</Link>}
        </div>
      )}
    </>
  );
}

export function CatChips({ value, onChange }: { value: Cat | 'all'; onChange: (c: Cat | 'all') => void }) {
  return (
    <div className="chips">
      {(['all', ...Object.keys(CATS)] as (Cat | 'all')[]).map((k) => (
        <button key={k} className={`chip ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>{k === 'all' ? 'ทั้งหมด' : CATS[k].label}</button>
      ))}
    </div>
  );
}
