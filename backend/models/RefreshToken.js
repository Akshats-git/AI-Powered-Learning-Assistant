import mongoose from "mongoose";

// The server-side half of refresh-token rotation-with-reuse-detection — a
// signed JWT alone can't support this, since verifying a signature says
// nothing about whether *this specific token* has already been exchanged
// for a newer one. `jti` identifies one token; `familyId` ties every token
// descended from one login together, so a detected replay can revoke the
// whole chain at once rather than just the one token that got reused.
//
// A TTL index on `expiresAt` means this collection self-cleans — no cron
// job needed to prune rows for tokens that expired naturally.
const refreshTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    familyId: { type: String, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RefreshToken", refreshTokenSchema);
