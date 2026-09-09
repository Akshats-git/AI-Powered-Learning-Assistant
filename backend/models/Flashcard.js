import mongoose from "mongoose";

// FSRS scheduling state (utils/fsrs.js) for one card. Named `schedule` and
// nested rather than flattened onto the card, both to keep it out of the way
// of the existing `difficulty` field (content difficulty, set once at
// generation time — a different concept from FSRS's own difficulty, which
// tracks how hard *this learner* finds the card and changes every review)
// and so a card that's never been reviewed can be told apart from one
// that's due right now: `reps === 0` means "new."
//
// `dueDate` defaults to card-creation time, which is exactly right without
// any special-casing — a brand-new card should show up in the due queue
// immediately, the same way SM-2/FSRS treat an unseen card as due "now."
const scheduleSchema = new mongoose.Schema(
  {
    stability: { type: Number, default: null },
    difficulty: { type: Number, default: null },
    reps: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    lastReviewedAt: { type: Date, default: null },
    dueDate: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    isFavorite: { type: Boolean, default: false },
    // Kept for backward compatibility with the progress-percent calculation
    // (flashcardController.js's withProgress) — now derived from
    // `schedule.reps > 0` rather than being its own independent flag.
    isReviewed: { type: Boolean, default: false },
    schedule: { type: scheduleSchema, default: () => ({}) },
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
