'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

export type ComboItem = { value: string; label: string; group?: string; hint?: string; disabled?: boolean; color?: string };

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, close]);
}

/** Searchable, scrollable dropdown (single or multi). Type to filter; ↑ ↓ Enter Esc work. */
export function Combo({
  items, value, onChange, placeholder = '— เลือก —', multi = false, prefix = '', clearable = true, empty = 'ไม่พบรายการ',
}: {
  items: ComboItem[];
  value: string | string[] | null;
  onChange: (v: string | string[] | null) => void;
  placeholder?: string;
  multi?: boolean;
  prefix?: string;
  clearable?: boolean;
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useOutside(box, () => setOpen(false));
  const selected = useMemo(() => new Set(multi ? ((value as string[] | null) ?? []) : value ? [value as string] : []), [value, multi]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => !t || i.label.toLowerCase().includes(t) || i.group?.toLowerCase().includes(t) || i.value.includes(t));
  }, [items, q]);
  useEffect(() => setHi(0), [q, open]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const pick = (i: ComboItem) => {
    if (i.disabled) return;
    if (multi) {
      const next = new Set(selected);
      if (next.has(i.value)) next.delete(i.value);
      else next.add(i.value);
      onChange([...next]);
    } else {
      onChange(i.value);
      setOpen(false);
      setQ('');
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && shown[hi]) pick(shown[hi]!); else setOpen(true); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const byValue = new Map(items.map((i) => [i.value, i]));
  const chosen = [...selected].map((v) => byValue.get(v) ?? { value: v, label: v });

  let lastGroup: string | undefined;
  return (
    <div className={`combo ${open ? 'open' : ''}`} ref={box} onKeyDown={onKey}>
      <div className="combo-field" onClick={() => setOpen(true)}>
        {multi && chosen.map((c) => (
          <span className="combo-tag" key={c.value} style={c.color ? { '--rc': c.color } as React.CSSProperties : undefined}>
            {prefix}{c.label}
            <button type="button" aria-label={`นำ ${c.label} ออก`} onClick={(e) => { e.stopPropagation(); pick(c as ComboItem); }}>×</button>
          </span>
        ))}
        <input
          className="combo-input"
          value={open ? q : ''}
          placeholder={multi ? (chosen.length ? '' : placeholder) : chosen[0] ? `${prefix}${chosen[0].label}` : placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          aria-expanded={open}
          role="combobox"
          style={!multi && chosen[0] && !open ? { color: 'var(--text)' } : undefined}
        />
        {!multi && clearable && chosen[0] && (
          <button type="button" className="combo-clear" aria-label="ล้าง" onClick={(e) => { e.stopPropagation(); onChange(null); }}>×</button>
        )}
        <svg className="combo-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </div>
      {open && (
        <div className="combo-list" ref={list} role="listbox">
          {!shown.length && <div className="combo-empty">{empty}</div>}
          {shown.map((i, n) => {
            const head = i.group !== lastGroup && i.group ? <div className="combo-group">{i.group}</div> : null;
            lastGroup = i.group;
            return (
              <div key={i.value}>
                {head}
                <div
                  data-i={n}
                  role="option"
                  aria-selected={selected.has(i.value)}
                  aria-disabled={i.disabled}
                  className={`combo-opt ${n === hi ? 'hi' : ''} ${selected.has(i.value) ? 'sel' : ''} ${i.disabled ? 'dis' : ''}`}
                  onMouseEnter={() => setHi(n)}
                  onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                >
                  {i.color && <span className="combo-dot" style={{ background: i.color }} />}
                  <span className="combo-lbl">{prefix}{i.label}</span>
                  {i.hint && <span className="combo-hint">{i.hint}</span>}
                  {selected.has(i.value) && <svg className="combo-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="m5 12 5 5 9-10" /></svg>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
