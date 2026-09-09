import mongoose from "mongoose";

// An append-only history of every graded review, independent of whatever the
// card's current scheduling state says. Two things need this to be
// immutable rather than derived: (1) the scheduler-comparison experiment
// (roadmap: "replay those logs against both schedulers") needs the exact
// sequence of real grades a card was ever given, not just its current state;
// (2) a retention-forecast chart needs real history to validate its
// predictions against. No route ever updates or deletes a row here.
const reviewLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    flashcardSet: { type: mongoose.Schema.Types.ObjectId, ref: "Flashcard", required: true },
    // Flashcard.cards is a subdocument array — this is that subdocument's
    // own _id, which is what a card keeps as it's reviewed over time even
    // though it has no top-level collection of its own.
    cardId: { type: mongoose.Schema.Types.ObjectId, required: true },
    algorithm: { type: String, enum: ["fsrs", "sm2"], required: true },
    grade: { type: String, enum: ["again", "hard", "good", "easy"], required: true },
    reviewedAt: { type: Date, required: true, default: Date.now },
    elapsedDays: { type: Number, default: null },
    // Full before/after scheduling state, so a replay doesn't need to
    // re-derive anything — it can just read what actually happened.
    stateBefore: { type: mongoose.Schema.Types.Mixed, required: true },
    stateAfter: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

reviewLogSchema.index({ user: 1, cardId: 1, reviewedAt: 1 });
reviewLogSchema.index({ flashcardSet: 1 });

export default mongoose.model("ReviewLog", reviewLogSchema);
