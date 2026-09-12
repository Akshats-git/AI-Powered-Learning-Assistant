import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, _resetKeyCache } from "../utils/encryption.js";

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

describe("encryption", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-do-not-use-in-production";
    _resetKeyCache();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
    _resetKeyCache();
  });

  it("round-trips a plaintext value", () => {
    const ciphertext = encrypt("sk-super-secret-api-key");
    expect(decrypt(ciphertext)).toBe("sk-super-secret-api-key");
  });

  it("produces different ciphertext for the same input each time (random IV)", () => {
    expect(encrypt("same-value")).not.toBe(encrypt("same-value"));
  });

  it("never contains the plaintext as a substring", () => {
    expect(encrypt("sk-super-secret-api-key")).not.toContain("sk-super-secret-api-key");
  });

  it("throws instead of decrypting tampered ciphertext", () => {
    const ciphertext = encrypt("sk-super-secret-api-key");
    const [iv, body, tag] = ciphertext.split(".");
    const tampered = [iv, body.slice(0, -2) + "aa", tag].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on a malformed payload", () => {
    expect(() => decrypt("not-a-real-payload")).toThrow(/Malformed/);
  });

  it("falls back to deriving from JWT_SECRET when ENCRYPTION_KEY is unset", () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.JWT_SECRET = "some-jwt-secret";
    _resetKeyCache();

    const ciphertext = encrypt("value-under-jwt-secret");
    expect(decrypt(ciphertext)).toBe("value-under-jwt-secret");
  });
});
