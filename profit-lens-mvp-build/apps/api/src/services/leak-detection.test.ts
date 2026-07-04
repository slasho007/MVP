import { describe, expect, it } from "vitest";
import type { Logger } from "../lib/logger.js";
import type { OrderRepository } from "../repositories/order.repository.js";
import type {
  ProfitLeakRepository,
  UpsertLeakInput,
} from "../repositories/profit-leak.repository.js";
import type { ShopRepository } from "../repositories/shop.repository.js";
import { LeakDetectionService } from "./leak-detection.service.js";

const SHOP_ID = "shop_1";

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

interface FakeOrder {
  discountCodes: string[];
  totalPrice: string;
  subtotalPrice: string;
  totalDiscounts: string;
  totalShipping: string;
  totalRefunded: string;
  processedAt: Date;
  lineItems: Array<{
    shopifyProductId: string | null;
    title: string;
    quantity: number;
    price: string;
  }>;
}

function makeOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    discountCodes: [],
    totalPrice: "100.00",
    subtotalPrice: "100.00",
    totalDiscounts: "0.00",
    totalShipping: "5.00",
    totalRefunded: "0.00",
    processedAt: new Date(),
    lineItems: [],
    ...overrides,
  };
}

function buildService(orders: FakeOrder[]): {
  service: LeakDetectionService;
  upserted: UpsertLeakInput[];
} {
  const upserted: UpsertLeakInput[] = [];

  const shopRepo = {
    findById: async () => ({
      id: SHOP_ID,
      isActive: true,
      currencyCode: "USD",
    }),
  } as unknown as ShopRepository;

  const orderRepo = {
    findManyByShop: async () => orders,
  } as unknown as OrderRepository;

  const leakRepo = {
    upsert: async (_shopId: string, input: UpsertLeakInput) => {
      upserted.push(input);
      return input;
    },
  } as unknown as ProfitLeakRepository;

  return {
    service: new LeakDetectionService(shopRepo, orderRepo, leakRepo, silentLogger),
    upserted,
  };
}

describe("LeakDetectionService", () => {
  it("returns 0 when the shop has no orders", async () => {
    const { service, upserted } = buildService([]);
    const count = await service.analyzeShop(SHOP_ID);
    expect(count).toBe(0);
    expect(upserted).toHaveLength(0);
  });

  it("detects discount overuse for a heavily used, high-rate code", async () => {
    // 6 orders, each using SAVE30 with a 30% discount of 70 on a 233 subtotal.
    const orders = Array.from({ length: 6 }, () =>
      makeOrder({
        discountCodes: ["SAVE30"],
        subtotalPrice: "163.00", // post-discount subtotal
        totalDiscounts: "70.00",
        totalPrice: "168.00",
      }),
    );
    const { service, upserted } = buildService(orders);
    await service.analyzeShop(SHOP_ID);

    const discountLeaks = upserted.filter((leak) => leak.type === "DISCOUNT_OVERUSE");
    expect(discountLeaks).toHaveLength(1);
    expect(discountLeaks[0]?.dedupeKey).toBe("discount:SAVE30");
    expect(Number.parseFloat(discountLeaks[0]?.estimatedLossAmount ?? "0")).toBeCloseTo(420, 0);
  });

  it("does not flag discount codes below the usage threshold", async () => {
    const orders = Array.from({ length: 3 }, () =>
      makeOrder({
        discountCodes: ["RARE"],
        subtotalPrice: "70.00",
        totalDiscounts: "30.00",
      }),
    );
    const { service, upserted } = buildService(orders);
    await service.analyzeShop(SHOP_ID);
    expect(upserted.filter((leak) => leak.type === "DISCOUNT_OVERUSE")).toHaveLength(0);
  });

  it("detects products with high refund rates", async () => {
    const productItem = {
      shopifyProductId: "p1",
      title: "Fragile Vase",
      quantity: 1,
      price: "100.00",
    };
    // 5 orders containing the product; 2 fully refunded (40% refund rate).
    const orders = [
      makeOrder({ lineItems: [productItem], totalRefunded: "100.00", totalPrice: "100.00" }),
      makeOrder({ lineItems: [productItem], totalRefunded: "100.00", totalPrice: "100.00" }),
      makeOrder({ lineItems: [productItem] }),
      makeOrder({ lineItems: [productItem] }),
      makeOrder({ lineItems: [productItem] }),
    ];
    const { service, upserted } = buildService(orders);
    await service.analyzeShop(SHOP_ID);

    const refundLeaks = upserted.filter((leak) => leak.type === "HIGH_REFUND_PRODUCT");
    expect(refundLeaks).toHaveLength(1);
    expect(refundLeaks[0]?.dedupeKey).toBe("product:p1");
  });

  it("detects free shipping stacked with deep discounts", async () => {
    const orders = Array.from({ length: 4 }, () =>
      makeOrder({
        totalShipping: "0.00",
        subtotalPrice: "60.00",
        totalDiscounts: "40.00", // 40% discount rate
      }),
    );
    const { service, upserted } = buildService(orders);
    await service.analyzeShop(SHOP_ID);

    const shippingLeaks = upserted.filter((leak) => leak.type === "FREE_SHIPPING_LOSS");
    expect(shippingLeaks).toHaveLength(1);
    expect(shippingLeaks[0]?.estimatedLossAmount).toBe("160.00");
  });

  it("skips inactive shops", async () => {
    const upserted: UpsertLeakInput[] = [];
    const service = new LeakDetectionService(
      { findById: async () => ({ id: SHOP_ID, isActive: false }) } as unknown as ShopRepository,
      { findManyByShop: async () => [makeOrder()] } as unknown as OrderRepository,
      {
        upsert: async (_shopId: string, input: UpsertLeakInput) => {
          upserted.push(input);
          return input;
        },
      } as unknown as ProfitLeakRepository,
      silentLogger,
    );
    const count = await service.analyzeShop(SHOP_ID);
    expect(count).toBe(0);
    expect(upserted).toHaveLength(0);
  });
});
