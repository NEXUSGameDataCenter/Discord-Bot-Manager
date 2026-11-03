'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { hasRole, type TeamRole } from '@nexus/shared';
import { useApi } from '@/lib/client';
import { NavIcon } from './NavIcon';

type Toast = { text: string; error?: boolean } | null;
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

type Item = [href: string, icon: string, label: string, min: TeamRole];
type Group = { id: string; label: string; hue: string; items: Item[] };
const groups: Group[] = [
  { id: 'overview', label: 'OVERVIEW', hue: '#38e1ff', items: [['/', 'dash', 'ภาพรวมระบบ', 'EDITOR'], ['/bots', 'bot', 'จัดการ Bots', 'ADMIN'], ['/servers', 'server', 'จัดการ Servers', 'ADMIN']] },
  { id: 'custom', label: 'BOT CUSTOMIZATION', hue: '#60a5fa', items: [['/profiles', 'idcard', 'Server Profiles', 'ADMIN'], ['/presets', 'layers', 'Profile Presets', 'ADMIN']] },
  { id: 'modules', label: 'MODULES', hue: '#a78bfa', items: [['/welcome', 'join', 'Welcome & Auto roles', 'ADMIN'], ['/reaction-roles', 'react', 'Reaction Roles', 'ADMIN'], ['/moderation', 'shield', 'Moderation & Honeypot', 'ADMIN']] },
  {
    id: 'comms',
    label: 'COMMUNICATION',
    hue: '#f472b6',
    items: [['/announcements', 'mega', 'Announcements', 'EDITOR'], ['/targets', 'target', 'Target Groups', 'EDITOR'], ['/tracking', 'pulse', 'Delivery Tracking', 'EDITOR'], ['/schedules', 'clock', 'Schedules', 'EDITOR']],
  },
  { id: 'account', label: 'ACCOUNT', hue: '#34d399', items: [['/me', 'user', 'My Profile', 'EDITOR'], ['/team', 'team', 'Team', 'EDITOR']] },
  { id: 'system', label: 'SYSTEM', hue: '#fbbf24', items: [['/audit', 'log', 'Audit Logs', 'ADMIN'], ['/settings', 'gear', 'Settings', 'ADMIN']] },
];
const NAV_KEY = 'nexus-nav-closed';

export type ShellUser = { name: string; email: string; role: TeamRole; avatarAssetId: string | null };
const UserCtx = createContext<ShellUser | null>(null);
/** The signed-in member (from the server layout). */
export const useMe = () => useContext(UserCtx)!;

export function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
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

  // Collapsed nav groups, remembered per browser (best effort).
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setClosed(JSON.parse(localStorage.getItem(NAV_KEY) ?? '{}') as Record<string, boolean>);
    } catch {}
  }, []);
  const toggle = (id: string) =>
    setClosed((c) => {
      const next = { ...c, [id]: !c[id] };
      try {
        localStorage.setItem(NAV_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  // Parallax on the header art + compact bar once the header scrolls away.
  const bg = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScroll = () => {
      const y = window.scrollY;
      if (!still && bg.current) bg.current.style.transform = `translateY(${y * 0.35}px) scale(1.06)`;
      setCompact(y > 150);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const avatar = (size: number) =>
    user.avatarAssetId ? <img src={`/api/assets/${user.avatarAssetId}`} alt="" style={{ width: size, height: size, objectFit: 'cover' }} /> : '♙';
  const pill = (
    <span className={`pill ${online ? '' : 'off'}`} title={online ? 'Bot online' : 'No bot online'}>
      <i />
      <span className="hide-mobile">{online ? 'ONLINE' : 'OFFLINE'}</span>
    </span>
  );

  return (
    <UserCtx.Provider value={user}>
    <ToastCtx.Provider value={notify}>
      <div className="app">
        <header className="hero">
          <div className="hero-bg" ref={bg} />
          <div className="hero-inner">
            <button className="secondary mobile-toggle" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>☰</button>
            <img src="/logo.png" alt="Nexus" className="mark" width={54} height={54} />
            <div className="brand">NEXUS<small>BOT CONTROL CENTER</small></div>
            <div className="top-spacer" />
            {pill}
            <Link href="/me" className="me" title={user.name}>{avatar(36)}</Link>
          </div>
        </header>
        <div className={`bar ${compact ? 'show' : ''}`} aria-hidden={!compact}>
          <button className="secondary mobile-toggle small" onClick={() => setOpen(!open)} aria-label="Menu" tabIndex={compact ? 0 : -1}>☰</button>
          <img src="/logo.png" alt="" width={30} height={30} />
          <b>NEXUS</b>
          <div className="top-spacer" />
          {pill}
        </div>
        <div className="shell">
          <aside className={open ? 'open' : ''}>
            <nav aria-label="เมนูหลัก">
              {groups
                .map((g) => ({ ...g, items: g.items.filter((i) => hasRole(user.role, i[3])) }))
                .filter((g) => g.items.length)
                .map((g) => {
                  const isOpen = !closed[g.id] || g.items.some(([href]) => active(href));
                  return (
                    <div className="group" key={g.id} style={{ '--hue': g.hue } as React.CSSProperties}>
                      <button className="ghead" aria-expanded={isOpen} aria-controls={`g-${g.id}`} onClick={() => toggle(g.id)}>
                        <span className="dot" />
                        {g.label}
                        <span className="gcount">{g.items.length}</span>
                        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      <div className="gbody" id={`g-${g.id}`}>
                        <div>
                          {g.items.map(([href, icon, label]) => (
                            <Link key={href} href={href} className={`nav ${active(href) ? 'active' : ''}`} onClick={() => setOpen(false)} tabIndex={isOpen ? 0 : -1}>
                              <span className="tile"><NavIcon name={icon} /></span>
                              <span className="txt">{label}</span>
                              {href === '/tracking' && !!overview?.failed7 && <span className="badge">{overview.failed7}</span>}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </nav>
            <div className="admin">
              <Link href="/me" className="avatar" style={{ overflow: 'hidden' }} title="My Profile">{avatar(30)}</Link>
              <div className="grow" style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</strong>
                <a href="/api/auth/signout" style={{ fontSize: 11 }}>Sign out</a>
              </div>
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </div>
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.error ? '✕  ' : '✓  '}{toast.text}</div>}
    </ToastCtx.Provider>
    </UserCtx.Provider>
  );
}

export function PageHead({ crumb, title, sub, action }: { crumb: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <>
      <div className="crumb">{crumb}</div>
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
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
