import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Shell } from '@/components/Shell';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.discordId) redirect('/login');
  return <Shell user={{ name: session.user.name, image: session.user.image }}>{children}</Shell>;
}
