import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

/**
 * The email link lands here and the person presses a button to finish signing in.
 * A button (POST) instead of signing in on GET stops email scanners that pre-open links from using up the token.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <div className="login">
      <section className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div className="brandmark" style={{ margin: '0 auto 12px' }}>✦</div>
        <div className="brand">NEXUS<small>BOT CONTROL CENTER</small></div>
        <p className="sub" style={{ margin: '14px 0' }}>กดปุ่มด้านล่างเพื่อเข้าสู่ระบบ</p>
        <form
          action={async () => {
            'use server';
            try {
              await signIn('magic-link', { token, redirectTo: '/' });
            } catch (e) {
              if (e instanceof AuthError) redirect('/login?error=link');
              throw e; // NEXT_REDIRECT on success
            }
          }}
        >
          <button type="submit" style={{ width: '100%' }}>เข้าสู่ระบบ</button>
        </form>
      </section>
    </div>
  );
}
