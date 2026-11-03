import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { prisma } from '@nexus/db';
import { passwordSchema } from '@nexus/shared';
import { signIn } from '@/auth';
import { consumeToken, peekToken } from '@/lib/server/magic';
import { hashPassword } from '@/lib/server/password';
import { AuthCard } from '@/components/AuthCard';

/**
 * Invite links: the invitee sets a name + password, then is signed in.
 * Owner recovery links: a button signs in (a button, not GET, so link scanners cannot use the token).
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; e?: string }> }) {
  const { token = '', e } = await searchParams;
  const row = await peekToken(token);
  if (!row) redirect('/login?m=link');
  const back = (msg: string) => redirect(`/auth/verify?token=${encodeURIComponent(token)}&e=${encodeURIComponent(msg)}`);

  if (row.purpose === 'INVITE') {
    const member = await prisma.teamMember.findUnique({ where: { email: row.email }, select: { name: true } });
    return (
      <AuthCard title="รับคำเชิญ" sub={`ตั้งรหัสผ่านสำหรับ ${row.email}`}>
        {e && <div className="notice">{e}</div>}
        <form
          action={async (fd: FormData) => {
            'use server';
            const name = String(fd.get('name') ?? '').trim().slice(0, 40);
            const pw = passwordSchema.safeParse(String(fd.get('password') ?? ''));
            if (!name) back('ใส่ชื่อที่แสดง');
            if (!pw.success) back(pw.error.issues[0]!.message);
            if (pw.data !== String(fd.get('confirm') ?? '')) back('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
            const m = await consumeToken(token, { name, passwordHash: await hashPassword(pw.data!) });
            if (!m) redirect('/login?m=link');
            try {
              await signIn('password', { email: m.email, password: pw.data, redirectTo: '/me' });
            } catch (err) {
              if (err instanceof AuthError) redirect('/login?m=bad');
              throw err;
            }
          }}
          className="authform"
        >
          <input className="input" id="name" name="name" required maxLength={40} defaultValue={member?.name ?? ''} placeholder="ชื่อที่แสดง" />
          <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="ตั้งรหัสผ่าน (อย่างน้อย 8 ตัว)" />
          <input className="input" id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="ยืนยันรหัสผ่าน" />
          <button type="submit">ยอมรับคำเชิญและเข้าสู่ระบบ</button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="กู้คืนบัญชี Owner" sub="กดปุ่มเพื่อเข้าสู่ระบบ แล้วตั้งรหัสผ่านใหม่ที่หน้า My Profile">
      <form
        action={async () => {
          'use server';
          try {
            await signIn('magic-link', { token, redirectTo: '/me' });
          } catch (err) {
            if (err instanceof AuthError) redirect('/login?m=link');
            throw err;
          }
        }}
        className="authform"
      >
        <button type="submit">เข้าสู่ระบบ</button>
      </form>
    </AuthCard>
  );
}
