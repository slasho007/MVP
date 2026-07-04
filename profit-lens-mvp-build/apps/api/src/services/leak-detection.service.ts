import type { LeakSeverity } from "@prisma/client";
import type { Logger } from "../lib/logger.js";
import type { OrderRepository } from "../repositories/order.repository.js";
import type { ProfitLeakRepository, UpsertLeakInput } from "../repositories/profit-leak.repository.js";
import type { ShopRepository } from "../repositories/shop.repository.js";

const ANALYSIS_WINDOW_DAYS = 90;

// Detection thresholds — deliberately simple and explainable for V1.
const DISCOUNT_CODE_MIN_USES = 5;
const DISCOUNT_CODE_MIN_TOTAL = 100; // in shop currency
const HIGH_DISCOUNT_RATE = 0.25; // avg discount >= 25% of order subtotal
const REFUND_RATE_THRESHOLD = 0.1; // product refunded on >= 10% of its orders
const PRODUCT_MIN_ORDERS = 5;
const UNPROFITABLE_MIN_ORDERS = 3;
const SHIPPING_LOSS_MIN_TOTAL = 50;

/**
 * Analyzes a shop's synced orders and upserts detected profit leaks.
 * Pure heuristics over local data — no external calls.
 */
export class LeakDetectionService {
  constructor(
    private readonly shopRepo: ShopRepository,
    private readonly orderRepo: OrderRepository,
    private readonly leakRepo: ProfitLeakRepository,
    private readonly logger: Logger,
  ) {}

  async analyzeShop(shopId: string): Promise<number> {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop || !shop.isActive) {
      this.logger.warn({ shopId }, "Skipping analysis: shop missing or inactive");
      return 0;
    }

    const since = new Date(Date.now() - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const orders = await this.orderRepo.findManyByShop(shopId, { since });
    if (orders.length === 0) return 0;

    const currency = shop.currencyCode;
    const leaks: UpsertLeakInput[] = [
      ...this.detectDiscountOveruse(orders, currency),
      ...this.detectHighRefundProducts(orders, currency),
      ...this.detectUnprofitableOrders(orders, currency),
      ...this.detectFreeShippingLoss(orders, currency),
    ];

    for (const leak of leaks) {
      await this.leakRepo.upsert(shopId, leak);
    }

    this.logger.info({ shopId, orderCount: orders.length, leakCount: leaks.length }, "Leak analysis complete");
    return leaks.length;
  }

  private detectDiscountOveruse(orders: OrderWithItems[], currency: string): UpsertLeakInput[] {
    const byCode = new Map<string, { uses: number; totalDiscount: number; totalSubtotal: number }>();

    for (const order of orders) {
      if (order.discountCodes.length === 0) continue;
      const discount = toNum(order.totalDiscounts);
      const subtotal = toNum(order.subtotalPrice) + discount;
      for (const code of order.discountCodes) {
        const entry = byCode.get(code) ?? { uses: 0, totalDiscount: 0, totalSubtotal: 0 };
        entry.uses += 1;
        entry.totalDiscount += discount / order.discountCodes.length;
        entry.totalSubtotal += subtotal / order.discountCodes.length;
        byCode.set(code, entry);
      }
    }

    const leaks: UpsertLeakInput[] = [];
    for (const [code, stats] of byCode) {
      if (stats.uses < DISCOUNT_CODE_MIN_USES) continue;
      if (stats.totalDiscount < DISCOUNT_CODE_MIN_TOTAL) continue;
      const rate = stats.totalSubtotal > 0 ? stats.totalDiscount / stats.totalSubtotal : 0;
      if (rate < HIGH_DISCOUNT_RATE) continue;

      leaks.push({
        type: "DISCOUNT_OVERUSE",
        severity: severityFromAmount(stats.totalDiscount),
        title: `Discount code "${code}" is eroding margins`,
        description:
          `Code "${code}" was used ${stats.uses} times in the last ${ANALYSIS_WINDOW_DAYS} days, ` +
          `discounting an average of ${(rate * 100).toFixed(0)}% per order ` +
          `(${stats.totalDiscount.toFixed(2)} ${currency} total).`,
        estimatedLossAmount: stats.totalDiscount.toFixed(2),
        currencyCode: currency,
        dedupeKey: `discount:${code}`,
        metadata: { code, uses: stats.uses, discountRate: rate },
      });
    }
    return leaks;
  }

  private detectHighRefundProducts(orders: OrderWithItems[], currency: string): UpsertLeakInput[] {
    const byProduct = new Map<
      string,
      { title: string; orderCount: number; refundedOrderCount: number; refundedAmount: number }
    >();

    for (const order of orders) {
      const refunded = toNum(order.totalRefunded);
      const orderTotal = toNum(order.totalPrice);
      const seen = new Set<string>();
      for (const item of order.lineItems) {
        if (!item.shopifyProductId || seen.has(item.shopifyProductId)) continue;
        seen.add(item.shopifyProductId);
        const entry = byProduct.get(item.shopifyProductId) ?? {
          title: item.title,
          orderCount: 0,
          refundedOrderCount: 0,
          refundedAmount: 0,
        };
        entry.orderCount += 1;
        if (refunded > 0) {
          entry.refundedOrderCount += 1;
          // Attribute a proportional share of the refund to this product.
          const itemValue = toNum(item.price) * item.quantity;
          entry.refundedAmount += orderTotal > 0 ? refunded * (itemValue / orderTotal) : 0;
        }
        byProduct.set(item.shopifyProductId, entry);
      }
    }

    const leaks: UpsertLeakInput[] = [];
    for (const [productId, stats] of byProduct) {
      if (stats.orderCount < PRODUCT_MIN_ORDERS) continue;
      const refundRate = stats.refundedOrderCount / stats.orderCount;
      if (refundRate < REFUND_RATE_THRESHOLD) continue;

      leaks.push({
        type: "HIGH_REFUND_PRODUCT",
        severity: severityFromAmount(stats.refundedAmount),
        title: `"${stats.title}" has a high refund rate`,
        description:
          `${(refundRate * 100).toFixed(0)}% of orders containing "${stats.title}" ` +
          `(${stats.refundedOrderCount} of ${stats.orderCount}) were refunded, ` +
          `costing an estimated ${stats.refundedAmount.toFixed(2)} ${currency}.`,
        estimatedLossAmount: stats.refundedAmount.toFixed(2),
        currencyCode: currency,
        dedupeKey: `product:${productId}`,
        metadata: { productId, refundRate, orderCount: stats.orderCount },
      });
    }
    return leaks;
  }

  private detectUnprofitableOrders(orders: OrderWithItems[], currency: string): UpsertLeakInput[] {
    // Orders where discounts + refunds exceed the amount actually collected.
    const unprofitable = orders.filter((order) => {
      const collected = toNum(order.totalPrice) - toNum(order.totalRefunded);
      const givenAway = toNum(order.totalDiscounts) + toNum(order.totalRefunded);
      return givenAway > 0 && collected < givenAway;
    });

    if (unprofitable.length < UNPROFITABLE_MIN_ORDERS) return [];

    const totalLoss = unprofitable.reduce(
      (sum, order) =>
        sum +
        (toNum(order.totalDiscounts) + toNum(order.totalRefunded) -
          (toNum(order.totalPrice) - toNum(order.totalRefunded))),
      0,
    );

    return [
      {
        type: "UNPROFITABLE_ORDER",
        severity: severityFromAmount(totalLoss),
        title: `${unprofitable.length} orders likely lost money`,
        description:
          `${unprofitable.length} orders in the last ${ANALYSIS_WINDOW_DAYS} days gave away more in ` +
          `discounts and refunds than they collected, for an estimated combined loss of ` +
          `${totalLoss.toFixed(2)} ${currency}.`,
        estimatedLossAmount: totalLoss.toFixed(2),
        currencyCode: currency,
        dedupeKey: "unprofitable-orders",
        metadata: { orderCount: unprofitable.length },
      },
    ];
  }

  private detectFreeShippingLoss(orders: OrderWithItems[], currency: string): UpsertLeakInput[] {
    // Orders that were heavily discounted AND shipped free: double margin hit.
    const affected = orders.filter((order) => {
      const shipping = toNum(order.totalShipping);
      const discount = toNum(order.totalDiscounts);
      const subtotal = toNum(order.subtotalPrice) + discount;
      return shipping === 0 && subtotal > 0 && discount / subtotal >= HIGH_DISCOUNT_RATE;
    });

    if (affected.length === 0) return [];

    const totalDiscount = affected.reduce((sum, o) => sum + toNum(o.totalDiscounts), 0);
    if (totalDiscount < SHIPPING_LOSS_MIN_TOTAL) return [];

    return [
      {
        type: "FREE_SHIPPING_LOSS",
        severity: severityFromAmount(totalDiscount),
        title: "Free shipping stacked with deep discounts",
        description:
          `${affected.length} orders combined free shipping with discounts of 25% or more, ` +
          `compounding margin loss by ${totalDiscount.toFixed(2)} ${currency} in discounts alone.`,
        estimatedLossAmount: totalDiscount.toFixed(2),
        currencyCode: currency,
        dedupeKey: "free-shipping-discount-stack",
        metadata: { orderCount: affected.length },
      },
    ];
  }
}

type OrderWithItems = Awaited<ReturnType<OrderRepository["findManyByShop"]>>[number];

function toNum(value: { toString(): string }): number {
  return Number.parseFloat(value.toString());
}

function severityFromAmount(amount: number): LeakSeverity {
  if (amount >= 1000) return "HIGH";
  if (amount >= 250) return "MEDIUM";
  return "LOW";
}
