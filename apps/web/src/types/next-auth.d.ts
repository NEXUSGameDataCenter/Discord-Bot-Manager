import 'next-auth';

declare module 'next-auth' {
  interface Session {
    /** id = TeamMember.id. Name/role are always re-read from the database, never trusted from the cookie. */
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}
