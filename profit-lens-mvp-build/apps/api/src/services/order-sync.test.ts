import { describe, expect, it } from "vitest";
import type { ShopifyOrder } from "../shopify/client.js";
import { mapShopifyOrder } from "./order-sync.service.js";

function makeOrder(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: 1001,
    order_number: 42,
    total_price: "100.00",
    subtotal_price: "90.00",
    total_discounts: "10.00",
    total_tax: "5.00",
    currency: "EUR",
    financial_status: "paid",
    processed_at: "2026-06-01T12:00:00Z",
    created_at: "2026-06-01T11:59:00Z",
    discount_codes: [{ code: "SUMMER10", amount: "10.00", type: "fixed_amount" }],
    total_shipping_price_set: { shop_money: { amount: "4.99", currency_code: "EUR" } },
    refunds: [
      {
        transactions: [
          { amount: "20.00", kind: "refund", status: "success" },
          { amount: "5.00", kind: "refund", status: "failure" },
          { amount: "3.00", kind: "sale", status: "success" },
        ],
      },
    ],
    line_items: [
      { product_id: 555, title: "Widget", quantity: 2, price: "45.00", total_discount: "10.00" },
      { product_id: null, title: "Custom item", quantity: 1, price: "0.00", total_discount: "0.00" },
    ],
    ...overrides,
  };
}

describe("mapShopifyOrder", () => {
  it("maps core financial fields", () => {
    const result = mapShopifyOrder(makeOrder());
    expect(result.shopifyOrderId).toBe("1001");
    expect(result.orderNumber).toBe("42");
    expect(result.totalPrice).toBe("100.00");
    expect(result.subtotalPrice).toBe("90.00");
    expect(result.totalDiscounts).toBe("10.00");
    expect(result.totalShipping).toBe("4.99");
    expect(result.totalTax).toBe("5.00");
    expect(result.currencyCode).toBe("EUR");
    expect(result.financialStatus).toBe("paid");
    expect(result.discountCodes).toEqual(["SUMMER10"]);
  });

  it("only counts successful refund transactions", () => {
    const result = mapShopifyOrder(makeOrder());
    expect(result.totalRefunded).toBe("20.00");
  });

  it("maps line items including products without ids", () => {
    const result = mapShopifyOrder(makeOrder());
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0]).toEqual({
      shopifyProductId: "555",
      title: "Widget",
      quantity: 2,
      price: "45.00",
      totalDiscount: "10.00",
    });
    expect(result.lineItems[1]?.shopifyProductId).toBeNull();
  });

  it("falls back to created_at when processed_at is missing", () => {
    const result = mapShopifyOrder(makeOrder({ processed_at: null }));
    expect(result.processedAt.toISOString()).toBe("2026-06-01T11:59:00.000Z");
  });

  it("defaults missing optional fields safely", () => {
    const order = makeOrder({
      total_shipping_price_set: undefined,
      refunds: undefined as unknown as ShopifyOrder["refunds"],
      discount_codes: undefined as unknown as ShopifyOrder["discount_codes"],
      financial_status: null,
    });
    const result = mapShopifyOrder(order);
    expect(result.totalShipping).toBe("0");
    expect(result.totalRefunded).toBe("0.00");
    expect(result.discountCodes).toEqual([]);
    expect(result.financialStatus).toBe("unknown");
  });
});
