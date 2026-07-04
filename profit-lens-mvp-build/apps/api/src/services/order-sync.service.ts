import type { Logger } from "../lib/logger.js";
import type { OrderRepository, UpsertOrderInput } from "../repositories/order.repository.js";
import type { ShopRepository } from "../repositories/shop.repository.js";
import type { ShopifyClient, ShopifyOrder } from "../shopify/client.js";

const SYNC_WINDOW_DAYS = 90;

/** Pulls orders from Shopify into the local database. */
export class OrderSyncService {
  constructor(
    private readonly shopRepo: ShopRepository,
    private readonly orderRepo: OrderRepository,
    private readonly shopifyClient: ShopifyClient,
    private readonly logger: Logger,
  ) {}

  /** Full backfill of the analysis window. Used on install and manual re-sync. */
  async syncShop(shopId: string): Promise<number> {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop || !shop.isActive || !shop.accessToken) {
      this.logger.warn({ shopId }, "Skipping sync: shop missing, inactive, or token-less");
      return 0;
    }

    await this.shopRepo.updateSyncStatus(shopId, "SYNCING");

    try {
      const createdAtMin = new Date(
        Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      let count = 0;
      for await (const page of this.shopifyClient.iterateOrders(shop.shopDomain, shop.accessToken, {
        createdAtMin,
      })) {
        for (const shopifyOrder of page) {
          await this.orderRepo.upsert(shopId, mapShopifyOrder(shopifyOrder));
          count += 1;
        }
      }

      await this.shopRepo.updateSyncStatus(shopId, "COMPLETED", new Date());
      this.logger.info({ shopId, count }, "Order sync complete");
      return count;
    } catch (error) {
      await this.shopRepo.updateSyncStatus(shopId, "FAILED");
      throw error;
    }
  }

  /** Upserts a single order from a webhook payload. */
  async upsertOrderFromWebhook(shopId: string, payload: ShopifyOrder): Promise<void> {
    await this.orderRepo.upsert(shopId, mapShopifyOrder(payload));
  }
}

export function mapShopifyOrder(order: ShopifyOrder): UpsertOrderInput {
  const totalRefunded = (order.refunds ?? [])
    .flatMap((refund) => refund.transactions ?? [])
    .filter((tx) => tx.kind === "refund" && tx.status === "success")
    .reduce((sum, tx) => sum + Number.parseFloat(tx.amount), 0);

  return {
    shopifyOrderId: String(order.id),
    orderNumber: String(order.order_number),
    totalPrice: order.total_price ?? "0",
    subtotalPrice: order.subtotal_price ?? "0",
    totalDiscounts: order.total_discounts ?? "0",
    totalShipping: order.total_shipping_price_set?.shop_money.amount ?? "0",
    totalRefunded: totalRefunded.toFixed(2),
    totalTax: order.total_tax ?? "0",
    discountCodes: (order.discount_codes ?? []).map((dc) => dc.code),
    financialStatus: order.financial_status ?? "unknown",
    currencyCode: order.currency ?? "USD",
    processedAt: new Date(order.processed_at ?? order.created_at),
    lineItems: (order.line_items ?? []).map((item) => ({
      shopifyProductId: item.product_id ? String(item.product_id) : null,
      title: item.title,
      quantity: item.quantity,
      price: item.price ?? "0",
      totalDiscount: item.total_discount ?? "0",
    })),
  };
}
