'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const TH_DOW_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

/** "now" in Asia/Bangkok as plain parts (the app schedules in Bangkok time). */
function bkkNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month! - 1, d: +p.day!, h: +p.hour! % 24, min: +p.minute! };
}
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? { y: +m[1]!, m: +m[2]! - 1, d: +m[3]!, h: +m[4]!, min: +m[5]! } : null;
};

function TimeSelect({ h, min, onChange }: { h: number; min: number; onChange: (h: number, min: number) => void }) {
  return (
    <div className="timesel">
      <select value={h} onChange={(e) => onChange(+e.target.value, min)} aria-label="ชั่วโมง">{HOURS.map((x) => <option key={x} value={x}>{pad(x)}</option>)}</select>
      <span>:</span>
      <select value={min - (min % 5)} onChange={(e) => onChange(h, +e.target.value)} aria-label="นาที">{MINUTES.map((x) => <option key={x} value={x}>{pad(x)}</option>)}</select>
      <span className="sub">น.</span>
    </div>
  );
}

/** Calendar + time picker. Value: "YYYY-MM-DDTHH:mm" in Asia/Bangkok. Past times are blocked. */
export function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const now = bkkNow();
  const v = parse(value);
  const [open, setOpen] = useState(!value);
  const [view, setView] = useState({ y: v?.y ?? now.y, m: v?.m ?? now.m });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const todayKey = key(now.y, now.m, now.d);
  const days = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
    const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    return [...Array<null>(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [view]);

  const set = (y: number, m: number, d: number, h: number, min: number) => onChange(`${key(y, m, d)}T${pad(h)}:${pad(min)}`);
  const h = v?.h ?? (now.h + 1) % 24;
  const min = v?.min ?? 0;
  const pickDay = (d: number) => {
    const k = key(view.y, view.m, d);
    // On today, never default to a time that has already passed.
    const hh = k === todayKey && h * 60 + min <= now.h * 60 + now.min ? Math.min(23, now.h + 1) : h;
    set(view.y, view.m, d, hh, k === todayKey && hh !== h ? 0 : min);
  };
  const past = v ? `${key(v.y, v.m, v.d)}T${pad(v.h)}:${pad(v.min)}` <= `${todayKey}T${pad(now.h)}:${pad(now.min)}` : false;
  const quick = (label: string, add: number, hh: number) => {
    const t = new Date(Date.UTC(now.y, now.m, now.d + add));
    return <button type="button" className="chip" onClick={() => { set(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hh, 0); setView({ y: t.getUTCFullYear(), m: t.getUTCMonth() }); }}>{label}</button>;
  };
  const label = v ? `${TH_DOW_FULL[new Date(Date.UTC(v.y, v.m, v.d)).getUTCDay()]} ${v.d} ${TH_MONTH[v.m]} ${v.y + 543} · ${pad(v.h)}:${pad(v.min)} น.` : 'เลือกวันและเวลา';

  return (
    <div className="dtp" ref={box}>
      <button type="button" className={`dtp-field ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <span style={{ color: v ? 'var(--text)' : 'var(--muted)' }}>{label}</span>
      </button>
      {past && <small className="err">เวลานี้ผ่านไปแล้ว เลือกเวลาในอนาคต</small>}
      {open && (
        <div className="dtp-pop">
          <div className="chips" style={{ marginBottom: 10 }}>
            {now.h < 20 && quick('คืนนี้ 20:00', 0, 20)}
            {quick('พรุ่งนี้ 09:00', 1, 9)}
            {quick('พรุ่งนี้ 18:00', 1, 18)}
          </div>
          <div className="dtp-head">
            <button type="button" className="ghost small" aria-label="เดือนก่อน" disabled={view.y === now.y && view.m === now.m} onClick={() => setView(({ y, m }) => (m ? { y, m: m - 1 } : { y: y - 1, m: 11 }))}>‹</button>
            <b>{TH_MONTH[view.m]} {view.y + 543}</b>
            <button type="button" className="ghost small" aria-label="เดือนถัดไป" onClick={() => setView(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}>›</button>
          </div>
          <div className="dtp-grid">
            {TH_DOW.map((d) => <span key={d} className="dtp-dow">{d}</span>)}
            {days.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const k = key(view.y, view.m, d);
              const sel = v && k === key(v.y, v.m, v.d);
              return (
                <button type="button" key={k} disabled={k < todayKey} className={`dtp-day ${sel ? 'sel' : ''} ${k === todayKey ? 'today' : ''}`} onClick={() => pickDay(d)}>{d}</button>
              );
            })}
          </div>
          <div className="dtp-foot">
            <span className="sub">เวลา</span>
            <TimeSelect h={h} min={min} onChange={(hh, mm) => set(v?.y ?? now.y, v?.m ?? now.m, v?.d ?? now.d, hh, mm)} />
            <span style={{ flex: 1 }} />
            <button type="button" className="small" disabled={!v || past} onClick={() => setOpen(false)}>ตกลง</button>
          </div>
        </div>
      )}
    </div>
  );
}

type Freq = 'daily' | 'weekly' | 'monthly' | 'custom';
/** Reads the simple cron shapes this builder writes; anything else opens in "custom". */
function parseCron(c: string): { freq: Freq; h: number; min: number; dows: number[]; dom: number } {
  const f = c.trim().split(/\s+/);
  const base = { h: 9, min: 0, dows: [1], dom: 1 };
  if (f.length !== 5 || !/^\d+$/.test(f[0]!) || !/^\d+$/.test(f[1]!)) return { freq: 'custom', ...base };
  const [mi, hr, dom, mon, dow] = f as [string, string, string, string, string];
  const hm = { h: +hr, min: +mi };
  if (mon !== '*') return { freq: 'custom', ...base };
  if (dom === '*' && dow === '*') return { freq: 'daily', ...base, ...hm };
  if (dom === '*' && /^[0-6](,[0-6])*$/.test(dow)) return { freq: 'weekly', ...base, ...hm, dows: dow.split(',').map(Number) };
  if (/^\d{1,2}$/.test(dom) && dow === '*') return { freq: 'monthly', ...base, ...hm, dom: +dom };
  return { freq: 'custom', ...base };
}

/** Repeat schedule without typing cron: daily / weekly days / monthly date + time. */
export function RepeatPicker({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
  const init = useMemo(() => parseCron(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [s, setS] = useState(init);
  const emit = (n: typeof s) => {
    setS(n);
    if (n.freq === 'daily') onChange(`${n.min} ${n.h} * * *`);
    if (n.freq === 'weekly') onChange(`${n.min} ${n.h} * * ${[...n.dows].sort().join(',') || '1'}`);
    if (n.freq === 'monthly') onChange(`${n.min} ${n.h} ${n.dom} * *`);
  };
  const summary =
    s.freq === 'daily' ? `ทุกวัน เวลา ${pad(s.h)}:${pad(s.min)} น.`
    : s.freq === 'weekly' ? `ทุกวัน${[...s.dows].sort().map((d) => TH_DOW_FULL[d]).join(', ')} เวลา ${pad(s.h)}:${pad(s.min)} น.`
    : s.freq === 'monthly' ? `วันที่ ${s.dom} ของทุกเดือน เวลา ${pad(s.h)}:${pad(s.min)} น.${s.dom > 28 ? ' (เดือนที่ไม่มีวันนี้จะข้าม)' : ''}`
    : `cron ${value}`;
  return (
    <div className="repeat">
      <div className="chips">
        {([['daily', 'ทุกวัน'], ['weekly', 'ทุกสัปดาห์'], ['monthly', 'ทุกเดือน'], ['custom', 'ขั้นสูง (cron)']] as [Freq, string][]).map(([k, l]) => (
          <button type="button" key={k} className={`chip ${s.freq === k ? 'on' : ''}`} onClick={() => emit({ ...s, freq: k })}>{l}</button>
        ))}
      </div>
      {s.freq === 'weekly' && (
        <div className="chips">
          {TH_DOW_FULL.map((d, i) => (
            <button type="button" key={d} className={`chip ${s.dows.includes(i) ? 'on' : ''}`} onClick={() => emit({ ...s, dows: s.dows.includes(i) ? (s.dows.length > 1 ? s.dows.filter((x) => x !== i) : s.dows) : [...s.dows, i] })}>{d}</button>
          ))}
        </div>
      )}
      {s.freq === 'monthly' && (
        <div className="dtp-grid" style={{ maxWidth: 300, marginBottom: 10 }}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <button type="button" key={d} className={`dtp-day ${s.dom === d ? 'sel' : ''}`} onClick={() => emit({ ...s, dom: d })}>{d}</button>)}
        </div>
      )}
      {s.freq !== 'custom' ? (
        <div className="row" style={{ gap: 8 }}><span className="sub">เวลา</span><TimeSelect h={s.h} min={s.min} onChange={(h, min) => emit({ ...s, h, min })} /></div>
      ) : (
        <div className="field">
          <input className="input mono" value={value} onChange={(e) => onChange(e.target.value)} />
          <small className="sub">นาที ชั่วโมง วันที่ เดือน วันในสัปดาห์ · เช่น <code>0 9 * * 1</code> = ทุกวันจันทร์ 09:00</small>
        </div>
      )}
      <div className="repeat-sum">{summary} (เวลาไทย)</div>
    </div>
  );
}
