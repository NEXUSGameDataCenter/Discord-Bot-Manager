import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { discordId?: string; name?: string | null; image?: string | null; email?: string | null };
  }
}
