'use client';
import { api } from './client';

export type PushState = 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on';

const b64 = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !standalone() ? 'ios-needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Ask permission, subscribe this browser and register it with the server. */
export async function enablePush(vapidPublicKey: string): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapidPublicKey) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api('/api/push', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } });
  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/api/push', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe();
  }
}

export async function currentEndpoint(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}
