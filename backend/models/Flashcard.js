import mongoose from "mongoose";

const cardSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    isFavorite: { type: Boolean, default: false },
    isReviewed: { type: Boolean, default: false },
  },
  { _id: true }
);

const flashcardSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    title: { type: String, required: true, trim: true },
    cards: { type: [cardSchema], default: [] },
  },
  { timestamps: true }
);

flashcardSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Flashcard", flashcardSchema);
