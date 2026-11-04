import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Nexus Manager', description: 'Nexus Discord bot control center' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0e0f11' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
