import mongoose from "mongoose";
import { hashPassword, verifyPassword, needsRehash } from "../utils/passwordHashing.js";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    aiUsage: {
      month: { type: String, default: "" }, // "YYYY-MM"; resets the counter when it changes
      spendUsd: { type: Number, default: 0 },
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    emailVerifiedAt: { type: Date, default: null },
    // A user's own OpenAI key, encrypted at rest (utils/encryption.js) —
    // select: false so it never rides along on a normal query; only
    // middlewares/aiKeyContext.js explicitly re-selects it. last4 is safe to
    // expose (it's how the profile page shows "key ending in ...abcd"
    // without ever sending the real value back to the browser).
    openaiApiKeyEncrypted: { type: String, select: false, default: null },
    openaiApiKeyLast4: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await hashPassword(this.password);
});

// Verifies against whichever algorithm actually produced this user's stored
// hash — see utils/passwordHashing.js for why that's bcrypt for some users
// and argon2id for others during the migration window.
userSchema.methods.comparePassword = function (candidatePassword) {
  return verifyPassword(this.password, candidatePassword);
};

// True once for every pre-argon2id account, on whatever login first
// verifies successfully against their bcrypt hash — see authController.js's
// login handler, the only place this can be acted on (it needs the
// plaintext password, which only exists in memory at that moment).
userSchema.methods.needsPasswordRehash = function () {
  return needsRehash(this.password);
};

userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    // Defense in depth on top of select: false — this field should never be
    // present on a doc serialized here, but never leaking it is worth not
    // relying on a single layer for.
    delete ret.openaiApiKeyEncrypted;
    return ret;
  },
});

export default mongoose.model("User", userSchema);
