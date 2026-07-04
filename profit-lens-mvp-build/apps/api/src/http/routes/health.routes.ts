import type { FastifyInstance } from "fastify";
import type { Container } from "../../container.js";

export function registerHealthRoutes(app: FastifyInstance, container: Container): void {
  // Liveness: is the process up?
  app.get("/health", async () => ({ status: "ok" }));

  // Readiness: can we reach our dependencies?
  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, "ok" | "error"> = { database: "ok", redis: "ok" };

    try {
      await container.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = "error";
    }
    try {
      await container.redis.ping();
    } catch {
      checks.redis = "error";
    }

    const healthy = Object.values(checks).every((status) => status === "ok");
    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      checks,
    });
  });
}
