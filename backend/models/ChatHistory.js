import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
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
