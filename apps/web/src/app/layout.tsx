import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Nexus Bot Control', description: 'Self-hosted Discord bot control center' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b1020' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
