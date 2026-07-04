import { randomBytes } from "node:crypto";
import type { Shop } from "@prisma/client";
import type { Env } from "../config/env.js";
import type { Logger } from "../lib/logger.js";
import type { ShopRepository } from "../repositories/shop.repository.js";
import type { ShopifyClient } from "../shopify/client.js";

const WEBHOOK_TOPICS = ["orders/create", "orders/updated", "app/uninstalled"] as const;

/** Handles the Shopify OAuth install flow and post-install setup. */
export class AuthService {
  constructor(
    private readonly env: Env,
    private readonly shopRepo: ShopRepository,
    private readonly shopifyClient: ShopifyClient,
    private readonly logger: Logger,
  ) {}

  generateState(): string {
    return randomBytes(16).toString("hex");
  }

  buildAuthorizationUrl(shopDomain: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.env.SHOPIFY_API_KEY,
      scope: this.env.SHOPIFY_SCOPES,
      redirect_uri: `${this.env.APP_URL}/auth/callback`,
      state,
    });
    return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Completes OAuth: exchanges the code, persists the shop,
   * and registers required webhooks.
   */
  async completeInstall(shopDomain: string, code: string): Promise<Shop> {
    const token = await this.shopifyClient.exchangeCodeForToken(shopDomain, code);

    let currencyCode: string | undefined;
    try {
      const info = await this.shopifyClient.getShopInfo(shopDomain, token.access_token);
      currencyCode = info.currency;
    } catch (error) {
      this.logger.warn({ shopDomain, error }, "Could not fetch shop info; using default currency");
    }

    const shop = await this.shopRepo.upsertOnInstall({
      shopDomain,
      accessToken: token.access_token,
      scopes: token.scope,
      currencyCode,
    });

    await this.registerWebhooks(shopDomain, token.access_token);
    this.logger.info({ shopDomain }, "Shop installed");
    return shop;
  }

  private async registerWebhooks(shopDomain: string, accessToken: string): Promise<void> {
    const address = `${this.env.APP_URL}/webhooks/shopify`;
    for (const topic of WEBHOOK_TOPICS) {
      try {
        await this.shopifyClient.registerWebhook(shopDomain, accessToken, topic, address);
      } catch (error) {
        // Webhook registration failure should not block installation.
        this.logger.error({ shopDomain, topic, error }, "Webhook registration failed");
      }
    }
  }
}
