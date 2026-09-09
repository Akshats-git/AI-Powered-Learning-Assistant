import mongoose from "mongoose";

// One row per retrieval chunk. `user` is duplicated from `document` rather
// than requiring a join, so a query can filter `{ user, document }` in one
// go — the same multi-tenant isolation Atlas Vector Search's metadata
// filtering would give for free once this moves to `$vectorSearch`; until
// then, `document`+`user` on every chunk is what lets a plain `find()` do it.
const chunkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    index: { type: Number, required: true },
    text: { type: String, required: true },
    page: { type: Number, default: null },
    endPage: { type: Number, default: null },
    sectionPath: { type: [String], default: [] },
    charStart: { type: Number, required: true },
    charEnd: { type: Number, required: true },
    tokens: { type: Number, required: true },
    // sha256 of `text`, keyed for a cheap "has this exact chunk already been
    // embedded" check — the "re-uploading the same PDF costs nothing" cache.
    contentHash: { type: String, required: true },
    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String, default: null },
  },
  { timestamps: true }
);

chunkSchema.index({ document: 1, index: 1 }, { unique: true });
chunkSchema.index({ user: 1, document: 1 });
chunkSchema.index({ contentHash: 1 });

export default mongoose.model("Chunk", chunkSchema);
