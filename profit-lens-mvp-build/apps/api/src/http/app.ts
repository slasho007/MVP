import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Container } from "../container.js";
import { AppError } from "./errors.js";
import { registerApiRoutes } from "./routes/api.routes.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerWebhookRoutes } from "./routes/webhook.routes.js";

export async function buildApp(container: Container): Promise<FastifyInstance> {
  const { env } = container;

  const app = Fastify({
    loggerInstance: container.logger,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024, // 2MB — Shopify order webhooks can be large
  });

  // Keep the raw body for webhook HMAC verification.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      (request as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        done(null, (body as Buffer).length > 0 ? JSON.parse((body as Buffer).toString("utf8")) : {});
      } catch (error) {
        done(error as Error);
      }
    },
  );

  await app.register(fastifyCookie, { secret: env.COOKIE_SECRET });
  await app.register(fastifyCors, {
    origin: [env.WEB_URL, /\.myshopify\.com$/, "https://admin.shopify.com"],
    credentials: true,
  });
  await app.register(fastifyRateLimit, {
    max: 120,
    timeWindow: "1 minute",
    allowList: () => false,
  });

  // Centralized error handling: known AppErrors map to their status codes,
  // everything else is logged and sanitized to a 500.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: { code: "REQUEST_ERROR", message: error.message },
      });
    }
    request.log.error({ err: error }, "Unhandled error");
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  });

  registerHealthRoutes(app, container);
  registerAuthRoutes(app, container);
  registerWebhookRoutes(app, container);
  registerApiRoutes(app, container);

  return app;
}
