import { routeAs } from '@/lib/server/route';
import { notify } from '@/lib/server/queue';

export const dynamic = 'force-dynamic';

export const POST = routeAs('EDITOR', async (_req, { member }) => {
  notify({ kind: 'bot_status', test: true, emails: [member.email], title: 'ทดสอบการแจ้งเตือน', body: 'ถ้าเห็นข้อความนี้ แปลว่าเครื่องนี้รับแจ้งเตือนได้แล้ว', link: '/me' });
  return { ok: true };
});
