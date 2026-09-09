import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import RefreshToken from "../models/RefreshToken.js";
import { startRefreshFamily, rotateRefreshToken, revokeFamily } from "../utils/refreshTokenStore.js";

const userId = () => new mongoose.Types.ObjectId();

describe("startRefreshFamily", () => {
  it("creates a fresh jti and familyId, and persists a row for it", async () => {
    const uid = userId();
    const { jti, familyId } = await startRefreshFamily(uid);

    expect(jti).toBeTruthy();
    expect(familyId).toBeTruthy();
    const row = await RefreshToken.findOne({ jti });
    expect(row).toMatchObject({ familyId, usedAt: null, revokedAt: null });
    expect(String(row.user)).toBe(String(uid));
  });

  it("starts a new, unrelated family on every call", async () => {
    const uid = userId();
    const a = await startRefreshFamily(uid);
    const b = await startRefreshFamily(uid);
    expect(a.familyId).not.toBe(b.familyId);
  });
});

describe("rotateRefreshToken", () => {
  it("rotates a valid, unused token to a new jti in the same family", async () => {
    const uid = userId();
    const { jti, familyId } = await startRefreshFamily(uid);

    const result = await rotateRefreshToken(jti, uid);

    expect(result.ok).toBe(true);
    expect(result.familyId).toBe(familyId);
    expect(result.jti).not.toBe(jti);

    const oldRow = await RefreshToken.findOne({ jti });
    expect(oldRow.usedAt).not.toBeNull();
    const newRow = await RefreshToken.findOne({ jti: result.jti });
    expect(newRow).toMatchObject({ familyId, usedAt: null, revokedAt: null });
  });

  it("rejects an unknown jti", async () => {
    const result = await rotateRefreshToken("not-a-real-jti", userId());
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("rejects a token belonging to a different user", async () => {
    const { jti } = await startRefreshFamily(userId());
    const result = await rotateRefreshToken(jti, userId());
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("rejects an already-revoked token", async () => {
    const uid = userId();
    const { jti, familyId } = await startRefreshFamily(uid);
    await revokeFamily(familyId);

    const result = await rotateRefreshToken(jti, uid);
    expect(result).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects an expired token", async () => {
    const uid = userId();
    const { jti } = await startRefreshFamily(uid);
    await RefreshToken.updateOne({ jti }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const result = await rotateRefreshToken(jti, uid);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("detects reuse — replaying an already-rotated token — and revokes the whole family", async () => {
    const uid = userId();
    const { jti, familyId } = await startRefreshFamily(uid);
    const firstRotation = await rotateRefreshToken(jti, uid);
    expect(firstRotation.ok).toBe(true);

    // Replaying the original (now-rotated-away) token — exactly what a
    // stolen token used after the legitimate client already refreshed looks like.
    const replay = await rotateRefreshToken(jti, uid);
    expect(replay).toEqual({ ok: false, reason: "reused" });

    // The whole family is now burned, including the token that was
    // legitimately issued by the first rotation — the only safe response to
    // "a token from this family was replayed" is "trust nothing in it."
    const rows = await RefreshToken.find({ familyId });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);

    const secondRotationNowRejected = await rotateRefreshToken(firstRotation.jti, uid);
    expect(secondRotationNowRejected).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects a missing/undefined jti rather than matching an unrelated row", async () => {
    const result = await rotateRefreshToken(undefined, userId());
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("revokeFamily", () => {
  it("revokes every unrevoked token in the family, and is a no-op on ones already revoked", async () => {
    const uid = userId();
    const { familyId, jti } = await startRefreshFamily(uid);
    const rotation = await rotateRefreshToken(jti, uid);

    await revokeFamily(familyId);
    const rows = await RefreshToken.find({ familyId });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    void rotation;
  });
});
