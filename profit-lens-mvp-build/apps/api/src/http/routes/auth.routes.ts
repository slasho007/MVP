import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Container } from "../../container.js";
import { isValidShopDomain, verifyShopifyQueryHmac } from "../../shopify/verify.js";
import { BadRequestError } from "../errors.js";

const STATE_COOKIE = "shopify_oauth_state";

const beginQuerySchema = z.object({
  shop: z.string().min(1),
});

const callbackQuerySchema = z.object({
  shop: z.string().min(1),
  code: z.string().min(1),
  state: z.string().min(1),
  hmac: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance, container: Container): void {
  const { env, services, logger } = container;

  /**
   * GET /auth?shop=my-store.myshopify.com
   * Entry point of the OAuth install flow.
   */
  app.get("/auth", async (request, reply) => {
    const parsed = beginQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new BadRequestError("Missing shop parameter");

    const shop = parsed.data.shop;
    if (!isValidShopDomain(shop)) throw new BadRequestError("Invalid shop domain");

    const state = services.auth.generateState();
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      signed: true,
      path: "/",
      maxAge: 600,
    });

    return reply.redirect(services.auth.buildAuthorizationUrl(shop, state));
  });

  /**
   * GET /auth/callback
   * Shopify redirects here after the merchant approves the app.
   */
  app.get("/auth/callback", async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new BadRequestError("Invalid OAuth callback parameters");

    const { shop, code, state } = parsed.data;
    if (!isValidShopDomain(shop)) throw new BadRequestError("Invalid shop domain");

    // Verify HMAC over the full query string
    const query = request.query as Record<string, string | string[] | undefined>;
    if (!verifyShopifyQueryHmac(query, env.SHOPIFY_API_SECRET)) {
      throw new BadRequestError("HMAC verification failed");
    }

    // Verify the state matches our signed cookie (CSRF protection)
    const rawCookie = request.cookies[STATE_COOKIE];
    const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
    if (!unsigned?.valid || unsigned.value !== state) {
      throw new BadRequestError("OAuth state mismatch");
    }
    reply.clearCookie(STATE_COOKIE, { path: "/" });

    const installedShop = await services.auth.completeInstall(shop, code);

    // Kick off initial data sync in the background.
    await container.queues.orderSync.add(
      "initial-sync",
      { shopId: installedShop.id },
      { jobId: `initial-sync:${installedShop.id}` },
    );

    logger.info({ shop }, "Install complete; redirecting to app");

    // Redirect into the embedded app inside the Shopify admin.
    const host = (request.query as Record<string, string>).host;
    const redirectUrl = host
      ? `https://${shop}/admin/apps/${env.SHOPIFY_API_KEY}`
      : env.WEB_URL;
    return reply.redirect(redirectUrl);
  });
}
