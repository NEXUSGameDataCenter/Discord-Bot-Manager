import 'server-only';
import nodemailer from 'nodemailer';
import { serverEnv } from './env';

export class NoEmailProvider extends Error {
  constructor() {
    super('ยังไม่ได้ตั้งค่าการส่งอีเมล (RESEND_API_KEY หรือ SMTP_URL)');
  }
}

export function emailConfigured(): boolean {
  const e = serverEnv();
  return !!(e.RESEND_API_KEY || e.SMTP_URL);
}

export async function sendMail(to: string, mail: { subject: string; html: string; text: string }): Promise<void> {
  const e = serverEnv();
  if (e.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [to], ...mail }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  if (e.SMTP_URL) {
    await nodemailer.createTransport(e.SMTP_URL).sendMail({ from: e.EMAIL_FROM, to, ...mail });
    return;
  }
  throw new NoEmailProvider();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function linkEmail(kind: 'login' | 'invite', url: string, inviter?: string) {
  const title = kind === 'login' ? 'ลิงก์เข้าสู่ระบบ Nexus Bot Control' : 'คุณได้รับเชิญเข้าใช้ Nexus Bot Control';
  const intro =
    kind === 'login'
      ? 'กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 15 นาที'
      : `${inviter ? esc(inviter) + ' ' : ''}เชิญคุณเข้าใช้ Dashboard ของ Nexus กดปุ่มด้านล่างเพื่อเริ่มใช้งาน ลิงก์หมดอายุใน 7 วัน`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
<h2 style="margin:0 0 12px">${title}</h2><p>${intro}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#6366f1;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${kind === 'login' ? 'เข้าสู่ระบบ' : 'รับคำเชิญ'}</a></p>
<p style="color:#64748b;font-size:12px">ถ้าคุณไม่ได้ขอลิงก์นี้ ไม่ต้องทำอะไร บัญชีของคุณยังปลอดภัย</p></div>`;
  return { subject: title, html, text: `${title}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${url}` };
}
