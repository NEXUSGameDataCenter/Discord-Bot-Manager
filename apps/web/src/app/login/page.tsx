import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { ownerRecovery } from '@/lib/server/access';
import { AuthCard } from '@/components/AuthCard';

const MSG: Record<string, [string, 'err' | 'ok']> = {
  bad: ['อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชียังไม่ได้รับการอนุมัติ', 'err'],
  link: ['ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว', 'err'],
  disabled: ['บัญชีนี้ถูกปิดการใช้งาน หรือยังไม่ได้รับอนุมัติ ติดต่อ Owner ของทีม', 'err'],
  requested: ['ส่งคำขอแล้ว เมื่อ Owner อนุมัติ คุณจะเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้ได้ทันที', 'ok'],
  recovery: ['ถ้าเป็นอีเมลของ Owner ลิงก์กู้คืนจะอยู่ใน log ของ service web บน Railway (ค้นหา "OWNER sign-in link")', 'ok'],
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ m?: string; error?: string }> }) {
  const { m, error } = await searchParams;
  const msg = MSG[m ?? (error ? (error === 'disabled' ? 'disabled' : 'bad') : '')];
  return (
    <AuthCard>
      {msg && <div className={msg[1] === 'ok' ? 'notice ok-notice' : 'notice'}>{msg[0]}</div>}
      <form
        action={async (fd: FormData) => {
          'use server';
          try {
            await signIn('password', { email: String(fd.get('email') ?? ''), password: String(fd.get('password') ?? ''), redirectTo: '/' });
          } catch (e) {
            if (e instanceof AuthError) redirect('/login?m=bad');
            throw e;
          }
        }}
        className="authform"
      >
        <input className="input" id="email" name="email" type="email" required autoComplete="email" placeholder="อีเมล" />
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" placeholder="รหัสผ่าน" />
        <button type="submit">เข้าสู่ระบบ</button>
      </form>
      <p className="sub" style={{ margin: '14px 0 0' }}>
        ยังไม่มีบัญชี? <Link href="/request-access">ขอเข้าร่วมทีม</Link>
      </p>
      <details className="more" style={{ marginTop: 10, textAlign: 'left' }}>
        <summary>Owner ลืมรหัสผ่าน</summary>
        <form
          action={async (fd: FormData) => {
            'use server';
            await ownerRecovery(String(fd.get('email') ?? ''));
            redirect('/login?m=recovery');
          }}
          className="authform"
        >
          <input className="input" id="recovery-email" name="email" type="email" required placeholder="อีเมลของ Owner" />
          <button type="submit" className="secondary">สร้างลิงก์กู้คืน (ดูใน Railway log)</button>
        </form>
      </details>
    </AuthCard>
  );
}
