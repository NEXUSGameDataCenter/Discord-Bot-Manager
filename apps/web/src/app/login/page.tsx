import { redirect } from 'next/navigation';
import { requestLogin } from '@/lib/server/login';

const ERRORS: Record<string, string> = {
  link: 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ขอลิงก์ใหม่ได้ด้านล่าง',
  disabled: 'บัญชีนี้ถูกปิดการใช้งาน หรือยังไม่ได้รับเชิญ ติดต่อ Owner ของทีม',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  return (
    <div className="login">
      <section className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div className="brandmark" style={{ margin: '0 auto 12px' }}>✦</div>
        <div className="brand">NEXUS<small>BOT CONTROL CENTER</small></div>
        {sent ? (
          <>
            <h3 style={{ marginTop: 18 }}>ตรวจสอบอีเมลของคุณ</h3>
            <p className="sub">ถ้าอีเมลนี้ได้รับเชิญเข้าทีมไว้ ลิงก์เข้าสู่ระบบจะถูกส่งไปภายใน 1 นาที ลิงก์ใช้ได้ครั้งเดียวและหมดอายุใน 15 นาที (ดูในโฟลเดอร์ Spam ด้วย)</p>
            <a href="/login"><button className="secondary" style={{ width: '100%' }}>ใช้อีเมลอื่น</button></a>
          </>
        ) : (
          <>
            <p className="sub" style={{ margin: '14px 0' }}>เข้าสู่ระบบด้วยอีเมลที่ได้รับเชิญ</p>
            {error && <div className="notice">{ERRORS[error] ?? 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง'}</div>}
            <form
              action={async (fd: FormData) => {
                'use server';
                await requestLogin(String(fd.get('email') ?? ''));
                redirect('/login?sent=1');
              }}
              style={{ display: 'grid', gap: 10 }}
            >
              <input className="input" id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
              <button type="submit" style={{ width: '100%' }}>ส่งลิงก์เข้าสู่ระบบ</button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
