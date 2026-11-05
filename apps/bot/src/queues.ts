import { Queue } from 'bullmq';
import { QUEUES, MAX_DELIVERY_ATTEMPTS, type DeliveryJob, type NotifyJob, type ProfileJob } from '@nexus/shared';
import { connection } from './redis';

export const RETRY_OPTS = { attempts: MAX_DELIVERY_ATTEMPTS, backoff: { type: 'custom' }, removeOnComplete: 1000, removeOnFail: 5000 } as const;
export const profileQueue = new Queue<ProfileJob>(QUEUES.profile, { connection });
export const deliveryQueue = new Queue<DeliveryJob>(QUEUES.delivery, { connection });
import type { ControlJob } from '@nexus/shared';
export const controlQueue = new Queue<ControlJob>(QUEUES.control, { connection });
export const notifyQueue = new Queue<NotifyJob>(QUEUES.notify, { connection });

/** Fire-and-forget: notification problems never break the caller. */
export function notify(job: NotifyJob, delayMs = 0): void {
  notifyQueue.add('notify', job, { removeOnComplete: 500, removeOnFail: 500, attempts: 2, delay: delayMs }).catch(() => undefined);
}
