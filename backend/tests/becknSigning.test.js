import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  publicKeyFromBase64,
  privateKeyFromBase64,
  publicKeyToBase64,
} from "../beckn/core/keys.js";
import {
  sign,
  verify,
  digestOf,
  buildSigningString,
  buildKeyId,
  parseKeyId,
  parseAuthorizationHeader,
  SignatureError,
  DIGEST_LABEL,
} from "../beckn/core/signing.js";

const SUBSCRIBER = "learn.example.com";
const KEY_ID = "key-1";

const setup = () => {
  const { publicKey, privateKey } = generateKeyPair();
  let t = 1_700_000_000_000;
  return {
    publicKey,
    privateKey,
    now: () => t,
    advance: (seconds) => { t += seconds * 1000; },
    lookupKey: async ({ subscriberId, keyId }) =>
      subscriberId === SUBSCRIBER && keyId === KEY_ID ? publicKey : null,
  };
};

const signBody = (body, env, ttlSeconds) =>
  sign({ body, subscriberId: SUBSCRIBER, keyId: KEY_ID, privateKey: env.privateKey, now: env.now, ...(ttlSeconds ? { ttlSeconds } : {}) });

describe("beckn keys", () => {
  it("round-trips a keypair through the raw base64 form the registry publishes", () => {
    const { publicKey, privateKey } = generateKeyPair();
    expect(Buffer.from(publicKey, "base64")).toHaveLength(32);
    expect(Buffer.from(privateKey, "base64")).toHaveLength(32);
    expect(publicKeyToBase64(publicKeyFromBase64(publicKey))).toBe(publicKey);
    expect(privateKeyFromBase64(privateKey).asymmetricKeyType).toBe("ed25519");
  });

  it("rejects a key of the wrong length rather than producing a broken KeyObject", () => {
    expect(() => publicKeyFromBase64(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("beckn signing string", () => {
  it("uses the BLAKE-512 label standardised in protocol-specifications-v2#183", () => {
    expect(DIGEST_LABEL).toBe("BLAKE-512");
    expect(buildSigningString({ created: 1, expires: 2, digest: "abc" })).toBe(
      "(created): 1\n(expires): 2\ndigest: BLAKE-512=abc"
    );
  });

  it("digests the exact bytes, so any change to the body changes the digest", () => {
    expect(digestOf('{"a":1}')).toBe(digestOf('{"a":1}'));
    expect(digestOf('{"a":1}')).not.toBe(digestOf('{"a":2}'));
  });

  it("builds and parses the pipe-separated keyId reverted in issue #185", () => {
    expect(buildKeyId({ subscriberId: SUBSCRIBER, keyId: KEY_ID })).toBe("learn.example.com|key-1|ed25519");
    expect(parseKeyId("learn.example.com|key-1|ed25519")).toEqual({
      subscriberId: SUBSCRIBER,
      keyId: KEY_ID,
      algorithm: "ed25519",
    });
  });

  it("refuses a keyId that is malformed or names another algorithm", () => {
    expect(parseKeyId("learn.example.com|key-1")).toBeNull();
    expect(parseKeyId("learn.example.com||ed25519")).toBeNull();
    expect(parseKeyId("learn.example.com|key-1|rsa")).toBeNull();
    expect(parseKeyId("")).toBeNull();
  });

  it("parses Authorization params regardless of order and rejects another scheme", () => {
    const parsed = parseAuthorizationHeader('Signature signature="s",keyId="a|b|ed25519",created="1",expires="2"');
    expect(parsed).toMatchObject({ keyId: "a|b|ed25519", signature: "s" });
    expect(parseAuthorizationHeader("Bearer abc")).toBeNull();
    expect(parseAuthorizationHeader("")).toBeNull();
  });
});

describe("beckn signature verification", () => {
  it("accepts a signature it just produced and reports who signed it", async () => {
    const env = setup();
    const body = JSON.stringify({ context: { action: "discover" } });
    const sender = await verify({ body, authorization: signBody(body, env), lookupKey: env.lookupKey, now: env.now });
    expect(sender).toMatchObject({ subscriberId: SUBSCRIBER, keyId: KEY_ID });
  });

  it("rejects a tampered body — the digest no longer matches what was signed", async () => {
    const env = setup();
    const authorization = signBody(JSON.stringify({ amount: 100 }), env);
    await expect(
      verify({ body: JSON.stringify({ amount: 1 }), authorization, lookupKey: env.lookupKey, now: env.now })
    ).rejects.toThrow(/signature verification failed/);
  });

  it("rejects a signature from a key the registry does not know", async () => {
    const env = setup();
    const body = "{}";
    const authorization = sign({ body, subscriberId: "attacker.example.com", keyId: KEY_ID, privateKey: env.privateKey, now: env.now });
    await expect(verify({ body, authorization, lookupKey: env.lookupKey, now: env.now })).rejects.toThrow(/unknown subscriber or key/);
  });

  it("rejects a signature made by a different key than the registry publishes", async () => {
    const env = setup();
    const other = generateKeyPair();
    const body = "{}";
    const authorization = sign({ body, subscriberId: SUBSCRIBER, keyId: KEY_ID, privateKey: other.privateKey, now: env.now });
    await expect(verify({ body, authorization, lookupKey: env.lookupKey, now: env.now })).rejects.toThrow(/signature verification failed/);
  });

  it("rejects an absent or malformed Authorization header", async () => {
    const env = setup();
    for (const authorization of [undefined, "", "Signature nonsense", "Bearer token"]) {
      await expect(verify({ body: "{}", authorization, lookupKey: env.lookupKey, now: env.now })).rejects.toBeInstanceOf(SignatureError);
    }
  });

  it("expires a signature once it is past its TTL plus the skew allowance", async () => {
    const env = setup();
    const body = "{}";
    const authorization = signBody(body, env, 30);

    env.advance(30 + 60 - 1);
    await expect(verify({ body, authorization, lookupKey: env.lookupKey, now: env.now })).resolves.toBeTruthy();

    env.advance(2);
    await expect(verify({ body, authorization, lookupKey: env.lookupKey, now: env.now })).rejects.toThrow(/expired/);
  });

  it("tolerates a peer clock 60s fast, per the default raised in issue #182", async () => {
    const env = setup();
    const body = "{}";
    const authorization = signBody(body, env);

    env.advance(-59);
    await expect(verify({ body, authorization, lookupKey: env.lookupKey, now: env.now })).resolves.toBeTruthy();

    env.advance(-5);
    await expect(verify({ body, authorization, lookupKey: env.lookupKey, now: env.now })).rejects.toThrow(/future/);
  });
});
