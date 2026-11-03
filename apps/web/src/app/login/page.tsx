import { signIn } from '@/auth';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login">
      <section className="card" style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div className="brandmark" style={{ margin: '0 auto 12px' }}>✦</div>
        <div className="brand">NEXUS<small>BOT CONTROL CENTER</small></div>
        <p className="sub" style={{ margin: '14px 0' }}>เข้าสู่ระบบด้วย Discord (เฉพาะ Admin ที่อยู่ใน ADMIN_DISCORD_IDS)</p>
        {error && <div className="notice">{error === 'AccessDenied' ? 'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน' : 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง'}</div>}
        <form
          action={async () => {
            'use server';
            await signIn('discord', { redirectTo: '/' });
          }}
        >
          <button type="submit" style={{ width: '100%' }}>Sign in with Discord</button>
        </form>
      </section>
    </div>
  );
}
