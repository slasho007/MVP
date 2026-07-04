import { loadEnv, type Env } from "./config/env.js";
import { createLogger, type Logger } from "./lib/logger.js";
import { createPrismaClient, type PrismaClient } from "./lib/prisma.js";
import { createRedisConnection, type Redis } from "./lib/redis.js";
import { createQueues, closeQueues, type Queues } from "./queue/queues.js";
import { OrderRepository } from "./repositories/order.repository.js";
import { ProfitLeakRepository } from "./repositories/profit-leak.repository.js";
import { ShopRepository } from "./repositories/shop.repository.js";
import { WebhookEventRepository } from "./repositories/webhook-event.repository.js";
import { AuthService } from "./services/auth.service.js";
import { DashboardService } from "./services/dashboard.service.js";
import { LeakDetectionService } from "./services/leak-detection.service.js";
import { OrderSyncService } from "./services/order-sync.service.js";
import { ShopifyClient } from "./shopify/client.js";

/**
 * Composition root. Simple manual dependency injection —
 * no framework needed at this scale.
 */
export interface Container {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  redis: Redis;
  queues: Queues;
  repos: {
    shop: ShopRepository;
    order: OrderRepository;
    profitLeak: ProfitLeakRepository;
    webhookEvent: WebhookEventRepository;
  };
  services: {
    auth: AuthService;
    orderSync: OrderSyncService;
    leakDetection: LeakDetectionService;
    dashboard: DashboardService;
  };
  shopifyClient: ShopifyClient;
  dispose(): Promise<void>;
}

export function createContainer(): Container {
  const env = loadEnv();
  const logger = createLogger(env);
  const prisma = createPrismaClient();
  const redis = createRedisConnection(env.REDIS_URL);
  const queues = createQueues(redis);

  const shopifyClient = new ShopifyClient({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecret: env.SHOPIFY_API_SECRET,
    apiVersion: env.SHOPIFY_API_VERSION,
  });

  const repos = {
    shop: new ShopRepository(prisma),
    order: new OrderRepository(prisma),
    profitLeak: new ProfitLeakRepository(prisma),
    webhookEvent: new WebhookEventRepository(prisma),
  };

  const services = {
    auth: new AuthService(env, repos.shop, shopifyClient, logger),
    orderSync: new OrderSyncService(repos.shop, repos.order, shopifyClient, logger),
    leakDetection: new LeakDetectionService(repos.shop, repos.order, repos.profitLeak, logger),
    dashboard: new DashboardService(repos.order, repos.profitLeak),
  };

  return {
    env,
    logger,
    prisma,
    redis,
    queues,
    repos,
    services,
    shopifyClient,
    async dispose() {
      await closeQueues(queues);
      await redis.quit();
      await prisma.$disconnect();
    },
  };
}
