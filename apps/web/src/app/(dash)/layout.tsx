import { redirect } from 'next/navigation';
import { prisma } from '@nexus/db';
import { auth } from '@/auth';
import { Shell } from '@/components/Shell';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/login');
  const m = await prisma.teamMember.findUnique({ where: { id } });
  if (!m || m.status !== 'ACTIVE') redirect('/login?error=disabled');
  return <Shell user={{ name: m.name ?? m.email.split('@')[0]!, email: m.email, role: m.role, avatarAssetId: m.avatarAssetId }}>{children}</Shell>;
}
