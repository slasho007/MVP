import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Container } from "../../container.js";
import { createAuthenticate, requireShop } from "../plugins/authenticate.js";
import { BadRequestError, NotFoundError } from "../errors.js";

const leakListQuerySchema = z.object({
  status: z.enum(["OPEN", "DISMISSED", "RESOLVED"]).optional(),
});

const leakStatusBodySchema = z.object({
  status: z.enum(["OPEN", "DISMISSED", "RESOLVED"]),
});

const leakParamsSchema = z.object({
  id: z.string().min(1),
});

/** Authenticated JSON API consumed by the embedded frontend. */
export function registerApiRoutes(app: FastifyInstance, container: Container): void {
  const authenticate = createAuthenticate(container);
  const { services, queues } = container;

  app.register(async (api) => {
    api.addHook("preHandler", authenticate);

    // Dashboard summary metrics
    api.get("/api/dashboard", async (request) => {
      const shop = requireShop(request);
      return services.dashboard.getSummary(shop);
    });

    // List profit leaks (optionally filtered by status)
    api.get("/api/leaks", async (request) => {
      const shop = requireShop(request);
      const parsed = leakListQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new BadRequestError("Invalid status filter");
      const leaks = await services.dashboard.listLeaks(shop.id, parsed.data.status);
      return { leaks };
    });

    // Update a leak's status (dismiss / resolve / reopen)
    api.patch("/api/leaks/:id", async (request) => {
      const shop = requireShop(request);
      const params = leakParamsSchema.safeParse(request.params);
      const body = leakStatusBodySchema.safeParse(request.body);
      if (!params.success || !body.success) throw new BadRequestError("Invalid request");

      const updated = await services.dashboard.updateLeakStatus(
        shop.id,
        params.data.id,
        body.data.status,
      );
      if (!updated) throw new NotFoundError("Leak not found");
      return { leak: updated };
    });

    // Trigger a manual re-sync + re-analysis
    api.post("/api/sync", async (request, reply) => {
      const shop = requireShop(request);
      await queues.orderSync.add(
        "manual-sync",
        { shopId: shop.id },
        { jobId: `manual-sync:${shop.id}:${Date.now()}` },
      );
      return reply.status(202).send({ status: "queued" });
    });
  });
}
