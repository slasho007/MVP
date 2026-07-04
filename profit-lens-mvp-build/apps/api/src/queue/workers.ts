import { Worker, type Job } from "bullmq";
import type { Container } from "../container.js";
import type { ShopifyOrder } from "../shopify/client.js";
import {
  QUEUE_NAMES,
  type LeakAnalysisJobData,
  type OrderSyncJobData,
  type WebhookJobData,
} from "./queues.js";

/** Delay before running leak analysis after a webhook, so bursts coalesce into one run. */
const LEAK_ANALYSIS_DEBOUNCE_MS = 60_000;

export interface Workers {
  orderSync: Worker<OrderSyncJobData>;
  leakAnalysis: Worker<LeakAnalysisJobData>;
  webhookProcessing: Worker<WebhookJobData>;
}

/**
 * Creates the BullMQ workers that process background jobs.
 * Runs in the dedicated worker process (see src/worker.ts).
 */
export function createWorkers(container: Container): Workers {
  const { logger, services, repos, queues, redis } = container;

  const orderSync = new Worker<OrderSyncJobData>(
    QUEUE_NAMES.ORDER_SYNC,
    async (job: Job<OrderSyncJobData>) => {
      const { shopId } = job.data;
      logger.info({ shopId, jobId: job.id }, "Order sync job started");
      const count = await services.orderSync.syncShop(shopId);
      // Analyze immediately after a full sync.
      await queues.leakAnalysis.add(
        "post-sync-analysis",
        { shopId },
        { jobId: `leak-analysis:${shopId}:${Date.now()}` },
      );
      return { synced: count };
    },
    { connection: redis, concurrency: 2 },
  );

  const leakAnalysis = new Worker<LeakAnalysisJobData>(
    QUEUE_NAMES.LEAK_ANALYSIS,
    async (job: Job<LeakAnalysisJobData>) => {
      const { shopId } = job.data;
      logger.info({ shopId, jobId: job.id }, "Leak analysis job started");
      const leakCount = await services.leakDetection.analyzeShop(shopId);
      return { leaks: leakCount };
    },
    { connection: redis, concurrency: 2 },
  );

  const webhookProcessing = new Worker<WebhookJobData>(
    QUEUE_NAMES.WEBHOOK_PROCESSING,
    async (job: Job<WebhookJobData>) => {
      const { topic, shopDomain, payload } = job.data;
      logger.info({ topic, shopDomain, jobId: job.id }, "Webhook job started");

      if (topic === "app/uninstalled") {
        const shop = await repos.shop.findByDomain(shopDomain);
        if (shop && shop.isActive) {
          await repos.shop.markUninstalled(shopDomain);
          logger.info({ shopDomain }, "Shop marked uninstalled");
        }
        return;
      }

      if (topic === "orders/create" || topic === "orders/updated") {
        const shop = await repos.shop.findByDomain(shopDomain);
        if (!shop || !shop.isActive) {
          logger.warn({ shopDomain, topic }, "Webhook for unknown or inactive shop; skipping");
          return;
        }

        await services.orderSync.upsertOrderFromWebhook(shop.id, payload as ShopifyOrder);

        // Debounced re-analysis: one pending job per shop.
        await queues.leakAnalysis.add(
          "webhook-analysis",
          { shopId: shop.id },
          {
            jobId: `leak-analysis:debounced:${shop.id}`,
            delay: LEAK_ANALYSIS_DEBOUNCE_MS,
          },
        );
        return;
      }

      logger.warn({ topic, shopDomain }, "Unhandled webhook topic");
    },
    { connection: redis, concurrency: 5 },
  );

  for (const worker of [orderSync, leakAnalysis, webhookProcessing]) {
    worker.on("failed", (job, error) => {
      logger.error(
        { queue: worker.name, jobId: job?.id, err: error },
        "Job failed",
      );
    });
    worker.on("error", (error) => {
      logger.error({ queue: worker.name, err: error }, "Worker error");
    });
  }

  return { orderSync, leakAnalysis, webhookProcessing };
}

export async function closeWorkers(workers: Workers): Promise<void> {
  await Promise.all([
    workers.orderSync.close(),
    workers.leakAnalysis.close(),
    workers.webhookProcessing.close(),
  ]);
}
