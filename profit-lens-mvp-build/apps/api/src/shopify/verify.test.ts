import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidShopDomain, verifyShopifyQueryHmac, verifyShopifyWebhookHmac } from "./verify.js";

const SECRET = "test-secret";

describe("verifyShopifyQueryHmac", () => {
  function sign(params: Record<string, string>): string {
    const message = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    return createHmac("sha256", SECRET).update(message).digest("hex");
  }

  it("accepts a correctly signed query", () => {
    const params = { shop: "test.myshopify.com", code: "abc", state: "xyz" };
    const hmac = sign(params);
    expect(verifyShopifyQueryHmac({ ...params, hmac }, SECRET)).toBe(true);
  });

  it("rejects a tampered query", () => {
    const params = { shop: "test.myshopify.com", code: "abc", state: "xyz" };
    const hmac = sign(params);
    expect(verifyShopifyQueryHmac({ ...params, code: "evil", hmac }, SECRET)).toBe(false);
  });

  it("rejects a missing hmac", () => {
    expect(verifyShopifyQueryHmac({ shop: "test.myshopify.com" }, SECRET)).toBe(false);
  });
});

describe("verifyShopifyWebhookHmac", () => {
  it("accepts a correctly signed body", () => {
    const body = Buffer.from(JSON.stringify({ id: 1 }));
    const hmac = createHmac("sha256", SECRET).update(body).digest("base64");
    expect(verifyShopifyWebhookHmac(body, hmac, SECRET)).toBe(true);
  });

  it("rejects an incorrect signature", () => {
    const body = Buffer.from(JSON.stringify({ id: 1 }));
    expect(verifyShopifyWebhookHmac(body, "invalid", SECRET)).toBe(false);
  });
});

describe("isValidShopDomain", () => {
  it("accepts valid myshopify domains", () => {
    expect(isValidShopDomain("my-store.myshopify.com")).toBe(true);
    expect(isValidShopDomain("store123.myshopify.com")).toBe(true);
  });

  it("rejects invalid domains", () => {
    expect(isValidShopDomain("evil.com")).toBe(false);
    expect(isValidShopDomain("my-store.myshopify.com.evil.com")).toBe(false);
    expect(isValidShopDomain("")).toBe(false);
    expect(isValidShopDomain("-bad.myshopify.com")).toBe(false);
  });
});
