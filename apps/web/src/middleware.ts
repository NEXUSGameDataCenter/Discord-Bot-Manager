import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/((?!api/auth|login|request-access|auth/verify|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.png|banner.jpg|sw.js|manifest.webmanifest).*)'],
};
