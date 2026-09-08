import mongoose from "mongoose";

// One row per LLM call, so spend can be queried and attributed after the
// fact instead of only existing as a line in the logs. Complements
// User.aiUsage (a running total used for the budget check) with the detail
// needed for a per-user/per-feature cost breakdown or an admin dashboard.
const llmCallSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    feature: { type: String, required: true },
    model: { type: String, required: true },
    promptTokens: { type: Number, default: null },
    completionTokens: { type: Number, default: null },
    totalTokens: { type: Number, default: null },
    costUsd: { type: Number, default: null },
    latencyMs: { type: Number, default: null },
    requestId: { type: String, default: null },
  },
  { timestamps: true }
);

llmCallSchema.index({ user: 1, createdAt: -1 });
llmCallSchema.index({ feature: 1, createdAt: -1 });

export default mongoose.model("LlmCall", llmCallSchema);
