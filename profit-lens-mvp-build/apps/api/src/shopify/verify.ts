import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies the HMAC on Shopify OAuth / app-load query strings. */
export function verifyShopifyQueryHmac(
  query: Record<string, string | string[] | undefined>,
  apiSecret: string,
): boolean {
  const { hmac, ...rest } = query;
  if (typeof hmac !== "string") return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const value = rest[key];
      const flat = Array.isArray(value) ? value.join(",") : (value ?? "");
      return `${key}=${flat}`;
    })
    .join("&");

  const digest = createHmac("sha256", apiSecret).update(message).digest("hex");
  return safeCompare(digest, hmac);
}

/** Verifies the X-Shopify-Hmac-Sha256 header on webhook payloads. */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer | string,
  hmacHeader: string,
  apiSecret: string,
): boolean {
  const digest = createHmac("sha256", apiSecret).update(rawBody).digest("base64");
  return safeCompare(digest, hmacHeader);
}

/** Validates a shop domain is a well-formed *.myshopify.com hostname. */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
