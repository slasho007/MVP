import type { Shop } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Container } from "../../container.js";
import { UnauthorizedError } from "../errors.js";
import { verifySessionToken } from "../session-token.js";

declare module "fastify" {
  interface FastifyRequest {
    shop: Shop | null;
  }
}

/**
 * Creates a preHandler that authenticates embedded app requests via
 * Shopify App Bridge session tokens (Authorization: Bearer <jwt>).
 */
export function createAuthenticate(container: Container) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing session token");
    }

    const session = verifySessionToken(
      header.slice("Bearer ".length),
      container.env.SHOPIFY_API_KEY,
      container.env.SHOPIFY_API_SECRET,
    );
    if (!session) {
      throw new UnauthorizedError("Invalid session token");
    }

    const shop = await container.repos.shop.findByDomain(session.shopDomain);
    if (!shop || !shop.isActive) {
      throw new UnauthorizedError("Shop is not installed");
    }

    request.shop = shop;
  };
}

/** Returns the authenticated shop or throws (type-safe accessor). */
export function requireShop(request: FastifyRequest): Shop {
  if (!request.shop) throw new UnauthorizedError();
  return request.shop;
}
