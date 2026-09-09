import mongoose from "mongoose";

// Cached AI outputs, keyed by document + some notion of "the same input
// again." Two lookup strategies share one collection because they're the
// same idea at heart — don't pay for a completion you've already produced:
//
//   feature "chat"    — fuzzy match via cosine similarity on
//                        `questionEmbedding` (utils/semanticCache.js).
//                        Only ever populated for a *fresh* question (no
//                        prior conversation turns) — "what about it?" means
//                        something different depending on history, so a
//                        history-bearing exchange is never cached or served
//                        from cache.
//   feature "summary" — exact match via `contentHash` (a hash of the exact
//                        text the summary was generated from) — a document's
//                        summary is deterministic-enough on unchanged input
//                        that an exact hash is the right tool, not a
//                        similarity threshold.
const generationCacheSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    feature: { type: String, enum: ["chat", "summary"], required: true },
    question: { type: String, default: null },
    questionEmbedding: { type: [Number], default: undefined },
    contentHash: { type: String, default: null },
    // { reply, sources, groundedness } for chat; { summary } for summary —
    // exactly the shape the controller would have produced without a cache.
    output: { type: mongoose.Schema.Types.Mixed, required: true },
    hitCount: { type: Number, default: 0 },
    lastHitAt: { type: Date, default: null },
  },
  { timestamps: true }
);

generationCacheSchema.index({ document: 1, feature: 1 });
generationCacheSchema.index({ document: 1, feature: 1, contentHash: 1 });

export default mongoose.model("GenerationCache", generationCacheSchema);
