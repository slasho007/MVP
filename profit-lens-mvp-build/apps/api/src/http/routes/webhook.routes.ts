import type { FastifyInstance } from "fastify";
import type { Container } from "../../container.js";
import { verifyShopifyWebhookHmac } from "../../shopify/verify.js";

/**
 * Shopify webhook receiver.
 * Verifies HMAC over the raw body, dedupes by webhook id, then enqueues
 * for async processing. Always responds quickly (Shopify requires < 5s).
 */
export function registerWebhookRoutes(app: FastifyInstance, container: Container): void {
  const { env, logger, queues, repos } = container;

  app.post(
    "/webhooks/shopify",
    {
      config: {
        // Raw body needed for HMAC verification; parsing configured in server.ts
        rawBody: true,
      },
    },
    async (request, reply) => {
      const hmac = request.headers["x-shopify-hmac-sha256"];
      const topic = request.headers["x-shopify-topic"];
      const shopDomain = request.headers["x-shopify-shop-domain"];
      const webhookId = request.headers["x-shopify-webhook-id"];

      if (
        typeof hmac !== "string" ||
        typeof topic !== "string" ||
        typeof shopDomain !== "string" ||
        typeof webhookId !== "string"
      ) {
        return reply.status(401).send({ error: "Missing webhook headers" });
      }

      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
      if (!rawBody || !verifyShopifyWebhookHmac(rawBody, hmac, env.SHOPIFY_API_SECRET)) {
        logger.warn({ topic, shopDomain }, "Webhook HMAC verification failed");
        return reply.status(401).send({ error: "HMAC verification failed" });
      }

      const shop = await repos.shop.findByDomain(shopDomain);
      const isNew = await repos.webhookEvent.recordIfNew(webhookId, topic, shop?.id);
      if (!isNew) {
        // Duplicate delivery — acknowledge without reprocessing.
        return reply.status(200).send({ status: "duplicate" });
      }

      await queues.webhookProcessing.add(topic, {
        topic,
        shopDomain,
        payload: request.body,
      });

      return reply.status(200).send({ status: "queued" });
    },
  );
}
