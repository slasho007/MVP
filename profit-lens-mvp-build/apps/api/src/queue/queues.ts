import { Queue } from "bullmq";
import type { Redis } from "../lib/redis.js";
import type { ShopifyOrder } from "../shopify/client.js";

export const QUEUE_NAMES = {
  ORDER_SYNC: "order-sync",
  LEAK_ANALYSIS: "leak-analysis",
  WEBHOOK_PROCESSING: "webhook-processing",
} as const;

export interface OrderSyncJobData {
  shopId: string;
}

export interface LeakAnalysisJobData {
  shopId: string;
}

export interface WebhookJobData {
  topic: string;
  shopDomain: string;
  payload: unknown;
}

export interface Queues {
  orderSync: Queue<OrderSyncJobData>;
  leakAnalysis: Queue<LeakAnalysisJobData>;
  webhookProcessing: Queue<WebhookJobData>;
}

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

export function createQueues(connection: Redis): Queues {
  return {
    orderSync: new Queue(QUEUE_NAMES.ORDER_SYNC, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    leakAnalysis: new Queue(QUEUE_NAMES.LEAK_ANALYSIS, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    webhookProcessing: new Queue(QUEUE_NAMES.WEBHOOK_PROCESSING, {
      connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
  };
}

export async function closeQueues(queues: Queues): Promise<void> {
  await Promise.all([
    queues.orderSync.close(),
    queues.leakAnalysis.close(),
    queues.webhookProcessing.close(),
  ]);
}

export type { ShopifyOrder };
