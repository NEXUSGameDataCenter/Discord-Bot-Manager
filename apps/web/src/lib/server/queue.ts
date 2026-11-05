import 'server-only';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUES, MAX_DELIVERY_ATTEMPTS, type ControlJob, type DeliveryJob, type DispatchJob, type ManageJob, type NotifyJob, type ProfileJob } from '@nexus/shared';
import { serverEnv } from './env';

const g = globalThis as unknown as { __nexusRedis?: Redis; __nexusQueues?: Map<string, Queue> };

export function redis(): Redis {
  return (g.__nexusRedis ??= new Redis(serverEnv().REDIS_URL, { maxRetriesPerRequest: null }));
}

function q<T>(name: string): Queue<T> {
  g.__nexusQueues ??= new Map();
  let queue = g.__nexusQueues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: redis() });
    g.__nexusQueues.set(name, queue);
  }
  return queue as Queue<T>;
}

export const RETRY_OPTS = { attempts: MAX_DELIVERY_ATTEMPTS, backoff: { type: 'custom' }, removeOnComplete: 1000, removeOnFail: 5000 } as const;

export const queues = {
  control: () => q<ControlJob>(QUEUES.control),
  profile: () => q<ProfileJob>(QUEUES.profile),
  dispatch: () => q<DispatchJob>(QUEUES.dispatch),
  delivery: () => q<DeliveryJob>(QUEUES.delivery),
  manage: () => q<ManageJob>(QUEUES.manage),
  notify: () => q<NotifyJob>(QUEUES.notify),
};

/** Fire-and-forget notification (handled by the bot worker). */
export function notify(job: NotifyJob): void {
  queues.notify().add('notify', job, { removeOnComplete: 500, removeOnFail: 500, attempts: 2 }).catch(() => undefined);
}

export const scheduleJobId = (announcementId: string) => `sched-${announcementId}`;
