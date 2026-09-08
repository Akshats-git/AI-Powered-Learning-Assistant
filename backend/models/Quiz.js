import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: String, required: true },
    explanation: { type: String, default: "" },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    title: { type: String, required: true, trim: true },
    questions: { type: [questionSchema], default: [] },
    // Keyed by questionId rather than position, so grading doesn't assume the
    // client echoed answers back in the same order the questions were stored.
    userAnswers: {
      type: [
        {
          questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
          answer: { type: String, default: null },
        },
      ],
      default: [],
    },
    score: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

quizSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Quiz", quizSchema);
