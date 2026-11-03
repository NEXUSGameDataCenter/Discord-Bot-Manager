/** Shared layout for the sign-in, request-access and invite pages: banner background + logo card. */
export function AuthCard({ title = 'เข้าสู่ระบบ', sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="login">
      <section className="card authcard">
        <img src="/logo.png" alt="Nexus" className="authlogo" width={84} height={84} />
        <div className="brand">NEXUS<small>BOT CONTROL CENTER</small></div>
        <h2 style={{ margin: '16px 0 4px' }}>{title}</h2>
        {sub && <p className="sub" style={{ margin: '0 0 12px' }}>{sub}</p>}
        {children}
      </section>
    </div>
  );
}
