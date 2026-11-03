import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requestAccess } from '@/lib/server/access';
import { clientIp } from '@/lib/server/ratelimit';
import { AuthCard } from '@/components/AuthCard';

export default async function RequestAccessPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <AuthCard title="ขอเข้าร่วมทีม" sub="กรอกข้อมูลแล้วรอ Owner กดอนุมัติในเว็บ ไม่มีการส่งอีเมล">
      {e && <div className="notice">{e}</div>}
      <form
        action={async (fd: FormData) => {
          'use server';
          const password = String(fd.get('password') ?? '');
          if (password !== String(fd.get('confirm') ?? '')) redirect(`/request-access?e=${encodeURIComponent('รหัสผ่านทั้งสองช่องไม่ตรงกัน')}`);
          const r = await requestAccess(
            { name: fd.get('name'), email: fd.get('email'), password, note: String(fd.get('note') ?? '') || undefined },
            await clientIp(),
          );
          if (!r.ok) redirect(`/request-access?e=${encodeURIComponent(r.error)}`);
          redirect('/login?m=requested');
        }}
        className="authform"
      >
        <input className="input" id="name" name="name" required maxLength={40} placeholder="ชื่อที่แสดง" />
        <input className="input" id="email" name="email" type="email" required autoComplete="email" placeholder="อีเมล (ใช้เข้าสู่ระบบ)" />
        <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="ตั้งรหัสผ่าน (อย่างน้อย 8 ตัว)" />
        <input className="input" id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" placeholder="ยืนยันรหัสผ่าน" />
        <input className="input" id="note" name="note" maxLength={200} placeholder="ข้อความถึง Owner (ไม่บังคับ) เช่น ทีมที่ดูแล" />
        <button type="submit">ส่งคำขอ</button>
      </form>
      <p className="sub" style={{ margin: '14px 0 0' }}><Link href="/login">← กลับไปหน้าเข้าสู่ระบบ</Link></p>
    </AuthCard>
  );
}
