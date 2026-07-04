/**
 * Minimal Shopify Admin REST client.
 * Only implements what V1 needs: token exchange, shop info, and order listing.
 */

export interface ShopifyClientConfig {
  apiKey: string;
  apiSecret: string;
  apiVersion: string;
}

export interface AccessTokenResponse {
  access_token: string;
  scope: string;
}

export interface ShopifyShopInfo {
  currency: string;
  name: string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  currency: string;
  financial_status: string | null;
  processed_at: string | null;
  created_at: string;
  discount_codes: Array<{ code: string; amount: string; type: string }>;
  total_shipping_price_set?: {
    shop_money: { amount: string; currency_code: string };
  };
  refunds: Array<{
    transactions: Array<{ amount: string; kind: string; status: string }>;
  }>;
  line_items: Array<{
    product_id: number | null;
    title: string;
    quantity: number;
    price: string;
    total_discount: string;
  }>;
}

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

export class ShopifyClient {
  constructor(private readonly config: ShopifyClientConfig) {}

  /** Exchanges an OAuth authorization code for a permanent access token. */
  async exchangeCodeForToken(shopDomain: string, code: string): Promise<AccessTokenResponse> {
    const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.apiKey,
        client_secret: this.config.apiSecret,
        code,
      }),
    });

    if (!response.ok) {
      throw new ShopifyApiError(
        `Token exchange failed for ${shopDomain}: ${response.status}`,
        response.status,
      );
    }
    return (await response.json()) as AccessTokenResponse;
  }

  async getShopInfo(shopDomain: string, accessToken: string): Promise<ShopifyShopInfo> {
    const data = await this.adminGet<{ shop: ShopifyShopInfo }>(shopDomain, accessToken, "shop.json");
    return data.shop;
  }

  /**
   * Fetches orders in pages using cursor-based (Link header) pagination.
   * Yields one page of orders at a time so callers can persist incrementally.
   */
  async *iterateOrders(
    shopDomain: string,
    accessToken: string,
    opts: { createdAtMin?: string; limit?: number } = {},
  ): AsyncGenerator<ShopifyOrder[]> {
    const params = new URLSearchParams({
      status: "any",
      limit: String(opts.limit ?? 250),
    });
    if (opts.createdAtMin) params.set("created_at_min", opts.createdAtMin);

    let path: string | null = `orders.json?${params.toString()}`;

    while (path) {
      const { data, nextPath } = await this.adminGetWithPagination<{ orders: ShopifyOrder[] }>(
        shopDomain,
        accessToken,
        path,
      );
      yield data.orders;
      path = nextPath;
    }
  }

  async registerWebhook(
    shopDomain: string,
    accessToken: string,
    topic: string,
    address: string,
  ): Promise<void> {
    const response = await fetch(this.adminUrl(shopDomain, "webhooks.json"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });

    // 422 with "already taken" means the webhook exists — that's fine.
    if (!response.ok && response.status !== 422) {
      throw new ShopifyApiError(
        `Webhook registration failed (${topic}): ${response.status}`,
        response.status,
      );
    }
  }

  private adminUrl(shopDomain: string, path: string): string {
    return `https://${shopDomain}/admin/api/${this.config.apiVersion}/${path}`;
  }

  private async adminGet<T>(shopDomain: string, accessToken: string, path: string): Promise<T> {
    const { data } = await this.adminGetWithPagination<T>(shopDomain, accessToken, path);
    return data;
  }

  private async adminGetWithPagination<T>(
    shopDomain: string,
    accessToken: string,
    path: string,
  ): Promise<{ data: T; nextPath: string | null }> {
    const response = await this.fetchWithRetry(this.adminUrl(shopDomain, path), {
      headers: { "X-Shopify-Access-Token": accessToken },
    });

    if (!response.ok) {
      throw new ShopifyApiError(
        `Shopify API request failed (${path}): ${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as T;
    return { data, nextPath: this.parseNextPath(response.headers.get("link")) };
  }

  /** Retries on 429 respecting Retry-After; single retry on 5xx. */
  private async fetchWithRetry(url: string, init: RequestInit, attempt = 0): Promise<Response> {
    const response = await fetch(url, init);

    if (response.status === 429 && attempt < 5) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "2");
      await sleep(Math.max(retryAfter, 1) * 1000);
      return this.fetchWithRetry(url, init, attempt + 1);
    }
    if (response.status >= 500 && attempt < 1) {
      await sleep(1000);
      return this.fetchWithRetry(url, init, attempt + 1);
    }
    return response;
  }

  private parseNextPath(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    // Link: <https://shop.myshopify.com/admin/api/2025-01/orders.json?page_info=xyz>; rel="next"
    const match = linkHeader.match(/<[^>]*\/admin\/api\/[^/]+\/([^>]+)>;\s*rel="next"/);
    return match?.[1] ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
