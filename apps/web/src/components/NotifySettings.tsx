'use client';
import { useEffect, useState } from 'react';
import { NOTIFY_KINDS, type NotifyKind, type NotifyPrefs } from '@nexus/shared';
import { api, useApi } from '@/lib/client';
import { currentEndpoint, disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import { useToast } from './Shell';

type Device = { id: string; endpoint: string; userAgent: string | null; createdAt: string };
type Data = { prefs: NotifyPrefs; devices: Device[]; vapidPublicKey: string | null };

function deviceName(ua: string | null) {
  if (!ua) return 'เบราว์เซอร์';
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'เบราว์เซอร์';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
}
const STATE_TEXT: Record<PushState, string> = {
  on: 'เครื่องนี้รับแจ้งเตือนอยู่',
  off: 'เครื่องนี้ยังไม่ได้เปิดรับแจ้งเตือน',
  denied: 'เบราว์เซอร์บล็อกการแจ้งเตือนไว้ · เปิดได้ที่ตั้งค่าเว็บไซต์ของเบราว์เซอร์',
  unsupported: 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน',
  'ios-needs-install': 'บน iPhone/iPad ให้เปิดใน Safari → แชร์ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอนนั้น',
};

const Tog = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
  <button type="button" className={`tog ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick} />
);

export function NotifySettings() {
  const toast = useToast();
  const { data, reload, setData } = useApi<Data>('/api/me/notify');
  const [state, setState] = useState<PushState | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
    void currentEndpoint().then(setMine);
  }, []);

  async function save(prefs: NotifyPrefs) {
    setData((d) => d && { ...d, prefs });
    try {
      await api('/api/me/notify', { method: 'PUT', body: prefs });
    } catch (e) {
      toast((e as Error).message, true);
      reload();
    }
  }
  async function turnOn() {
    if (!data?.vapidPublicKey) return toast('ระบบยังไม่ได้ตั้งค่า Web Push', true);
    setBusy(true);
    try {
      const s = await enablePush(data.vapidPublicKey);
      setState(s);
      setMine(await currentEndpoint());
      if (s === 'on') toast('เปิดแจ้งเตือนบนเครื่องนี้แล้ว');
      reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function turnOff() {
    setBusy(true);
    await disablePush().catch(() => undefined);
    setState(await pushState());
    setMine(null);
    setBusy(false);
    reload();
  }
  async function remove(id: string) {
    await api('/api/push', { method: 'DELETE', body: { id } });
    reload();
  }
  async function test() {
    await api('/api/push/test', { method: 'POST', body: {} });
    toast('ส่งแจ้งเตือนทดสอบแล้ว');
  }

  if (!data) return null;
  const p = data.prefs;
  const flip = (ch: 'web' | 'push', k: NotifyKind) => save({ ...p, [ch]: { ...p[ch], [k]: !p[ch][k] } });
  return (
    <div id="notify" style={{ marginTop: 12 }}>
      <div className="grid two">
        <section className="card">
          <h3>เครื่องที่รับแจ้งเตือน</h3>
          <p className="sub" style={{ marginTop: -4 }}>{state ? STATE_TEXT[state] : 'กำลังตรวจสอบ…'}</p>
          {data.devices.map((d) => (
            <div className="ndev" key={d.id}>
              <div>{deviceName(d.userAgent)}<small>{d.endpoint === mine ? 'เครื่องนี้ · ' : ''}เปิดใช้ {new Date(d.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</small></div>
              <button className="secondary small" onClick={() => (d.endpoint === mine ? turnOff() : remove(d.id))}>นำออก</button>
            </div>
          ))}
          <div className="toolbar" style={{ marginTop: 16 }}>
            {state === 'off' && <button className="small" disabled={busy} onClick={turnOn}>เปิดรับบนเครื่องนี้</button>}
            {!!data.devices.length && <button className="secondary small" onClick={test}>ส่งแจ้งเตือนทดสอบ</button>}
          </div>
        </section>
        <section className="card">
          <h3>ช่วงเวลาเงียบ</h3>
          <p className="sub" style={{ marginTop: -4 }}>ไม่เด้งที่เครื่องในช่วงนี้ ยังเก็บไว้ในกระดิ่งตามปกติ (เวลาไทย)</p>
          <div className="switchline" style={{ padding: '8px 0' }}><span>เปิดช่วงเวลาเงียบ</span><Tog label="ช่วงเวลาเงียบ" on={p.quiet.on} onClick={() => save({ ...p, quiet: { ...p.quiet, on: !p.quiet.on } })} /></div>
          <div className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <span className="sub">ตั้งแต่</span>
            <input className="input mono" type="time" style={{ width: 'auto' }} value={p.quiet.start} onChange={(e) => save({ ...p, quiet: { ...p.quiet, start: e.target.value } })} />
            <span className="sub">ถึง</span>
            <input className="input mono" type="time" style={{ width: 'auto' }} value={p.quiet.end} onChange={(e) => save({ ...p, quiet: { ...p.quiet, end: e.target.value } })} />
          </div>
          <div className="switchline" style={{ padding: '12px 0 0', borderTop: '1px solid var(--line)' }}>
            <span>เรื่องด่วนเด้งเสมอ<small className="sub" style={{ display: 'block' }}>Bot offline เกิน 5 นาที หรือเริ่มทำงานไม่ได้</small></span>
            <Tog label="เรื่องด่วนเด้งเสมอ" on={p.quiet.urgentAlways} onClick={() => save({ ...p, quiet: { ...p.quiet, urgentAlways: !p.quiet.urgentAlways } })} />
          </div>
        </section>
      </div>
      <section className="card" style={{ marginTop: 12 }}>
        <h3>เรื่องที่ต้องการรับ</h3>
        <table className="ntable">
          <thead><tr><th>เรื่อง</th><th className="c">ในเว็บ</th><th className="c">เครื่อง</th></tr></thead>
          <tbody>
            {(Object.keys(NOTIFY_KINDS) as NotifyKind[]).map((k) => (
              <tr key={k}>
                <td>{NOTIFY_KINDS[k].label}<small>{NOTIFY_KINDS[k].hint}</small></td>
                <td className="c"><Tog label={`${NOTIFY_KINDS[k].label} ในเว็บ`} on={!!p.web[k]} onClick={() => flip('web', k)} /></td>
                <td className="c"><Tog label={`${NOTIFY_KINDS[k].label} ที่เครื่อง`} on={!!p.push[k]} onClick={() => flip('push', k)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
