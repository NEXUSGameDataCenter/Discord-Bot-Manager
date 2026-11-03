'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useApi } from '@/lib/client';

type Toast = { text: string; error?: boolean } | null;
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

const groups: { label: string; items: [string, string, string][] }[] = [
  { label: 'OVERVIEW', items: [['/', '▦', 'ภาพรวมระบบ'], ['/bots', '♟', 'จัดการ Bots'], ['/servers', '▤', 'จัดการ Servers']] },
  { label: 'BOT CUSTOMIZATION', items: [['/profiles', '◉', 'Server Profiles'], ['/presets', '▱', 'Profile Presets']] },
  { label: 'MODULES', items: [['/welcome', '✋', 'Welcome & Auto roles'], ['/reaction-roles', '◎', 'Reaction Roles'], ['/moderation', '⛨', 'Moderation & Honeypot']] },
  {
    label: 'COMMUNICATION',
    items: [['/announcements', '➤', 'Announcements'], ['/targets', '♧', 'Target Groups'], ['/tracking', '⌁', 'Delivery Tracking'], ['/schedules', '◷', 'Schedules']],
  },
  { label: 'SYSTEM', items: [['/audit', '▤', 'Audit Logs'], ['/settings', '⚙', 'Settings']] },
];

export function Shell({ user, children }: { user: { name?: string | null; image?: string | null }; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = useCallback((text: string, error?: boolean) => {
    setToast({ text, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const { data: overview } = useApi<{ failed7: number; bots: { status: string }[] }>('/api/overview');
  const online = overview?.bots.some((b) => b.status === 'ONLINE');
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <ToastCtx.Provider value={notify}>
      <div className="app">
        <header className="topbar">
          <button className="secondary mobile-toggle" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <div className="brandmark">✦</div>
          <div className="brand">NEXUS<small>BOT CONTROL CENTER</small></div>
          <div className="top-spacer" />
          <span className="pill" style={online ? undefined : { background: '#452432', color: '#fda4af' }}>● {online ? 'SYSTEM ONLINE' : 'NO BOT ONLINE'}</span>
        </header>
        <div className="layout">
          <aside className={open ? 'open' : ''}>
            <div className="workspace">
              <div className="eyebrow">ACTIVE WORKSPACE</div>
              <strong>◈ &nbsp; Nexus Workspace</strong>
              <br />
              <small>Administrator</small>
            </div>
            <div>
              {groups.map((g) => (
                <div className="navgroup" key={g.label}>
                  <div className="eyebrow">{g.label}</div>
                  {g.items.map(([href, ico, label]) => (
                    <Link key={href} href={href} className={`navitem ${active(href) ? 'active' : ''}`} onClick={() => setOpen(false)}>
                      <span className="ico">{ico}</span>
                      {label}
                      {href === '/tracking' && !!overview?.failed7 && <span className="count">{overview.failed7}</span>}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
            <div className="security">
              <strong>◈ SECURITY STATUS</strong>
              <br />
              <span style={{ color: '#6ee7b7' }}>● Admin allow-list active</span>
              <br />
              <small>Tokens encrypted · AES-256-GCM</small>
            </div>
            <div className="admin">
              <div className="avatar">{user.image ? <img src={user.image} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} /> : '♙'}</div>
              <div className="grow">
                <strong style={{ fontSize: 12 }}>{user.name ?? 'Administrator'}</strong>
                <br />
                <a href="/api/auth/signout" style={{ fontSize: 11 }}>Sign out</a>
              </div>
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </div>
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.error ? '✕  ' : '✓  '}{toast.text}</div>}
    </ToastCtx.Provider>
  );
}

export function PageHead({ crumb, title, sub, action }: { crumb: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <>
      <div className="crumb">NEXUS / CONTROL PANEL / {crumb}</div>
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        {action}
      </div>
    </>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return <>{Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i} />)}</>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card empty">{children}</div>;
}

export function ErrorBox({ error }: { error?: string }) {
  return error ? <div className="notice" style={{ background: '#452432', color: '#fecdd3' }}>{error}</div> : null;
}
