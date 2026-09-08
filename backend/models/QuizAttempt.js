import mongoose from "mongoose";

// An append-only record of every graded submission. Quiz itself only tracks
// the latest attempt (`isCompleted`/`score`/`userAnswers`) and today only
// ever gets one submission, but this collection is what a future multi-attempt
// history, retake flow, or per-question analytics would read from — none of
// that has to touch the grading path again to be added later.
const quizAttemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    answers: {
      type: [
        {
          questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
          answer: { type: String, default: null },
        },
      ],
      default: [],
    },
    total: { type: Number, required: true },
    correct: { type: Number, required: true },
    score: { type: Number, required: true },
  },
  { timestamps: true }
);

quizAttemptSchema.index({ user: 1, quiz: 1, createdAt: -1 });

export default mongoose.model("QuizAttempt", quizAttemptSchema);
