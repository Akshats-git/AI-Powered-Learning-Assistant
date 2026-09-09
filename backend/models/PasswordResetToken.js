import mongoose from "mongoose";

// Mirrors RefreshToken.js's shape: only a hash of the token is ever stored
// (the raw token exists only in the email and the requester's browser), and
// a TTL index self-cleans expired rows with no cron job needed.
const passwordResetTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PasswordResetToken", passwordResetTokenSchema);
