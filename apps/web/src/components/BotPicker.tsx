'use client';
import { useEffect } from 'react';
import { useApi } from '@/lib/client';
import type { BotsResponse } from '@/lib/types';

/** Bot dropdown. Auto-selects the first bot. */
export function BotPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useApi<BotsResponse>('/api/bots');
  useEffect(() => {
    if (!value && data?.bots[0]) onChange(data.bots[0].id);
  }, [data, value, onChange]);
  if (!data) return <select disabled><option>Loading bots…</option></select>;
  if (!data.bots.length) return <select disabled><option>ยังไม่มี Bot — เพิ่มที่หน้า จัดการ Bots</option></select>;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Bot">
      {data.bots.map((b) => (
        <option key={b.id} value={b.id}>
          {b.username} · {b.status} · {b.guildCount} servers
        </option>
      ))}
    </select>
  );
}
