import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
}

export interface VerifiedSession {
  shopDomain: string;
  payload: SessionTokenPayload;
}

/**
 * Verifies a Shopify App Bridge session token (JWT, HS256).
 * Implemented directly to avoid an extra dependency — the algorithm is fixed
 * by Shopify and the token structure is stable.
 */
export function verifySessionToken(
  token: string,
  apiKey: string,
  apiSecret: string,
): VerifiedSession | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Verify signature
  const expected = createHmac("sha256", apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  const sigA = Buffer.from(expected);
  const sigB = Buffer.from(signatureB64);
  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) return null;

  // Verify header algorithm
  let header: { alg?: string };
  let payload: SessionTokenPayload;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  // Verify claims
  const now = Math.floor(Date.now() / 1000);
  const skew = 10; // seconds of allowed clock skew
  if (payload.exp < now - skew) return null;
  if (payload.nbf > now + skew) return null;
  if (payload.aud !== apiKey) return null;

  // dest is "https://{shop}.myshopify.com"
  const destMatch = /^https:\/\/([a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com)$/.exec(payload.dest);
  if (!destMatch || !destMatch[1]) return null;

  return { shopDomain: destMatch[1], payload };
}
