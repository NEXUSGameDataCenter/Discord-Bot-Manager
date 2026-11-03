import { Queue } from 'bullmq';
import { QUEUES, MAX_DELIVERY_ATTEMPTS, type DeliveryJob, type ProfileJob } from '@nexus/shared';
import { connection } from './redis';

export const RETRY_OPTS = { attempts: MAX_DELIVERY_ATTEMPTS, backoff: { type: 'custom' }, removeOnComplete: 1000, removeOnFail: 5000 } as const;
export const profileQueue = new Queue<ProfileJob>(QUEUES.profile, { connection });
export const deliveryQueue = new Queue<DeliveryJob>(QUEUES.delivery, { connection });
