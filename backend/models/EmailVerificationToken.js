import mongoose from "mongoose";

// Same shape and reasoning as PasswordResetToken.js: only a hash is stored,
// a TTL index self-cleans expired rows.
const emailVerificationTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("EmailVerificationToken", emailVerificationTokenSchema);
