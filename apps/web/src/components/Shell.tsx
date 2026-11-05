'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { hasRole, type TeamRole } from '@nexus/shared';
import { prefetch, useApi } from '@/lib/client';
import { NavIcon } from './NavIcon';
import { Bell } from './Bell';

type Toast = { text: string; error?: boolean } | null;
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

type Item = [href: string, icon: string, label: string, min: TeamRole];
type Group = { id: string; label: string; items: Item[] };
const groups: Group[] = [
  { id: 'overview', label: 'ภาพรวม', items: [['/', 'dash', 'ภาพรวมระบบ', 'EDITOR'], ['/bots', 'bot', 'Bots', 'ADMIN'], ['/servers', 'server', 'Servers', 'ADMIN']] },
  { id: 'modules', label: 'โมดูล', items: [['/welcome', 'join', 'Welcome & auto roles', 'ADMIN'], ['/reaction-roles', 'react', 'Reaction roles', 'ADMIN'], ['/moderation', 'shield', 'Moderation & honeypot', 'ADMIN']] },
  { id: 'comms', label: 'การสื่อสาร', items: [['/announcements', 'mega', 'ประกาศ', 'EDITOR'], ['/targets', 'target', 'Target groups', 'EDITOR'], ['/tracking', 'pulse', 'Delivery tracking', 'EDITOR'], ['/schedules', 'clock', 'ตั้งเวลา', 'EDITOR']] },
  { id: 'account', label: 'บัญชี', items: [['/me', 'user', 'My profile', 'EDITOR'], ['/team', 'team', 'ทีม', 'EDITOR']] },
  { id: 'system', label: 'ระบบ', items: [['/audit', 'log', 'Audit logs', 'ADMIN'], ['/settings', 'gear', 'ตั้งค่า', 'ADMIN']] },
];
const NAV_KEY = 'nexus-nav-closed';

export type ShellUser = { name: string; email: string; role: TeamRole; avatarAssetId: string | null };
const UserCtx = createContext<ShellUser | null>(null);
/** The signed-in member (from the server layout). */
export const useMe = () => useContext(UserCtx)!;
const ROLE: Record<TeamRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', EDITOR: 'Editor' };

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
  // Most pages start from the bot list; load it once up front.
  useEffect(() => prefetch('/api/bots'), []);
  const bots = overview?.bots ?? [];
  const onlineCount = bots.filter((b) => b.status === 'ONLINE').length;
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

  return (
    <UserCtx.Provider value={user}>
    <ToastCtx.Provider value={notify}>
      <div className="mbar">
        <button className="ghost small" onClick={() => setOpen(!open)} aria-label="เมนู" aria-expanded={open}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <img src="/logo.png" alt="" width={26} height={26} />
        <b>Nexus</b>
        <span style={{ flex: 1 }} />
        <Bell />
      </div>
      <div className="app">
        <aside className={`side ${open ? 'open' : ''}`}>
          <div className="sbrandrow">
            <Link href="/" className="sbrand" onClick={() => setOpen(false)}>
              <img src="/logo.png" alt="Nexus" width={32} height={32} />
              <span><b>Nexus</b><small>Bot control</small></span>
            </Link>
          </div>
          {overview && (
            <div className={`botstate ${onlineCount ? '' : 'off'}`}><i />{bots.length ? `Bots ออนไลน์ ${onlineCount}/${bots.length}` : 'ยังไม่มี Bot'}</div>
          )}
          <nav aria-label="เมนูหลัก">
            {groups
              .map((g) => ({ ...g, items: g.items.filter((i) => hasRole(user.role, i[3])) }))
              .filter((g) => g.items.length)
              .map((g) => {
                const isOpen = !closed[g.id] || g.items.some(([href]) => active(href));
                return (
                  <div key={g.id}>
                    <button className="ghead" aria-expanded={isOpen} aria-controls={`g-${g.id}`} onClick={() => toggle(g.id)}>
                      {g.label}
                      <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    <div className="gbody" id={`g-${g.id}`}>
                      <div>
                        {g.items.map(([href, icon, label]) => (
                          <Link key={href} href={href} className={`nav ${active(href) ? 'active' : ''}`} onClick={() => setOpen(false)} tabIndex={isOpen ? 0 : -1}>
                            <NavIcon name={icon} />
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
          <div className="sfoot">
            <Link href="/me" className="avatar" title="My profile" onClick={() => setOpen(false)}>
              {user.avatarAssetId ? <img src={`/api/assets/${user.avatarAssetId}`} alt="" /> : (user.name[0] ?? '?').toUpperCase()}
            </Link>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>{user.name}</b>
              <small>{ROLE[user.role]} · <a href="/api/auth/signout">ออกจากระบบ</a></small>
            </div>
          </div>
        </aside>
        <main className="main"><div className="topbell"><Bell /></div>{children}</main>
      </div>
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role="status">{toast.text}</div>}
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
