import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword, isBcryptHash, isArgon2Hash, needsRehash } from "../utils/passwordHashing.js";

describe("hashPassword", () => {
  it("produces an argon2id hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("produces a different hash each time (a fresh random salt per call)", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("verifies a password against its own argon2id hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("still verifies a password against a legacy bcrypt hash", async () => {
    const bcryptHash = await bcrypt.hash("legacy-password", 10);
    expect(await verifyPassword(bcryptHash, "legacy-password")).toBe(true);
    expect(await verifyPassword(bcryptHash, "wrong-password")).toBe(false);
  });
});

describe("isBcryptHash / isArgon2Hash", () => {
  it("recognizes the bcrypt hash prefix variants", () => {
    expect(isBcryptHash("$2a$10$abc")).toBe(true);
    expect(isBcryptHash("$2b$10$abc")).toBe(true);
    expect(isBcryptHash("$2y$10$abc")).toBe(true);
    expect(isBcryptHash("$argon2id$v=19$...")).toBe(false);
  });

  it("recognizes the argon2 hash prefix", () => {
    expect(isArgon2Hash("$argon2id$v=19$...")).toBe(true);
    expect(isArgon2Hash("$2a$10$abc")).toBe(false);
  });

  it("handles empty/undefined input without throwing", () => {
    expect(isBcryptHash(undefined)).toBe(false);
    expect(isArgon2Hash("")).toBe(false);
  });
});

describe("needsRehash", () => {
  it("is true for a bcrypt hash and false for an argon2id one", async () => {
    const bcryptHash = await bcrypt.hash("x", 10);
    const argon2Hash = await hashPassword("x");

    expect(needsRehash(bcryptHash)).toBe(true);
    expect(needsRehash(argon2Hash)).toBe(false);
  });
});
