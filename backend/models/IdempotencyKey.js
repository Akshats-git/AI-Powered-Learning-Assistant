import mongoose from "mongoose";

// One row per (user, Idempotency-Key). Lets a client safely retry a request
// whose response it never received — a dropped connection, a token-refresh
// retry, a double-click — without paying for the generation twice or creating
// a second flashcard set/quiz.
const idempotencyKeySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    // Hash of method + path + body: the same key reused for a *different*
    // request is a client bug and must not silently replay the wrong response.
    requestHash: { type: String, required: true },
    status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
    responseStatus: { type: Number, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

idempotencyKeySchema.index({ user: 1, key: 1 }, { unique: true });
// Keys are only meaningful for a retry window; expire them after a day.
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.model("IdempotencyKey", idempotencyKeySchema);
