import mongoose from "mongoose";

// The citation metadata for one retrieved chunk an assistant reply was
// grounded in — see utils/citations.js's toSources(), which produces exactly
// this shape. Kept on the message itself (not recomputed later) so a chat
// history you reload still shows what it was actually answered from.
const sourceSchema = new mongoose.Schema(
  {
    chunkId: { type: mongoose.Schema.Types.ObjectId, ref: "Chunk", default: null },
    page: { type: Number, default: null },
    endPage: { type: Number, default: null },
    sectionPath: { type: [String], default: [] },
    snippet: { type: String, default: "" },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    // Only ever set on assistant messages, and only when retrieval had chunks
    // to search — left undefined (not `[]`) everywhere else so older
    // messages and user messages don't carry a meaningless empty array.
    sources: { type: [sourceSchema], default: undefined },
  },
  { _id: false }
);

const chatHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

chatHistorySchema.index({ user: 1, createdAt: -1 });
chatHistorySchema.index({ user: 1, document: 1 });

export default mongoose.model("ChatHistory", chatHistorySchema);
