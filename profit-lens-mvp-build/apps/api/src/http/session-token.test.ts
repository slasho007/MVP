import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySessionToken, type SessionTokenPayload } from "./session-token.js";

const API_KEY = "test-api-key";
const API_SECRET = "test-api-secret";

function makeToken(
  overrides: Partial<SessionTokenPayload> = {},
  opts: { secret?: string; alg?: string } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    iss: "https://test-shop.myshopify.com/admin",
    dest: "https://test-shop.myshopify.com",
    aud: API_KEY,
    sub: "12345",
    exp: now + 60,
    nbf: now - 10,
    iat: now,
    jti: "unique-id",
    ...overrides,
  };
  const header = Buffer.from(JSON.stringify({ alg: opts.alg ?? "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", opts.secret ?? API_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

describe("verifySessionToken", () => {
  it("accepts a valid token and extracts the shop domain", () => {
    const result = verifySessionToken(makeToken(), API_KEY, API_SECRET);
    expect(result).not.toBeNull();
    expect(result?.shopDomain).toBe("test-shop.myshopify.com");
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = makeToken({}, { secret: "wrong-secret" });
    expect(verifySessionToken(token, API_KEY, API_SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeToken({ exp: now - 120 });
    expect(verifySessionToken(token, API_KEY, API_SECRET)).toBeNull();
  });

  it("rejects a token with the wrong audience", () => {
    const token = makeToken({ aud: "another-app" });
    expect(verifySessionToken(token, API_KEY, API_SECRET)).toBeNull();
  });

  it("rejects a token with a non-myshopify dest", () => {
    const token = makeToken({ dest: "https://evil.example.com" });
    expect(verifySessionToken(token, API_KEY, API_SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifySessionToken("not-a-jwt", API_KEY, API_SECRET)).toBeNull();
    expect(verifySessionToken("a.b", API_KEY, API_SECRET)).toBeNull();
  });

  it("rejects a token with a non-HS256 algorithm", () => {
    const token = makeToken({}, { alg: "none" });
    expect(verifySessionToken(token, API_KEY, API_SECRET)).toBeNull();
  });
});
