import mongoose from "mongoose";
import { BKT_DEFAULT_PARAMETERS } from "../utils/bkt.js";

// One row per (user, document, concept) — the running Bayesian Knowledge
// Tracing estimate of how well a user knows one concept, built up from every
// quiz answer tagged with that concept (see quizController.js's submitQuiz,
// utils/masteryTracking.js). This is what makes a "weak areas" panel driven
// by inference rather than just counting right/wrong answers per question.
const masterySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: "Document", required: true },
    concept: { type: String, required: true, trim: true },
    pKnown: { type: Number, default: BKT_DEFAULT_PARAMETERS.prior },
    opportunities: { type: Number, default: 0 },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

masterySchema.index({ user: 1, document: 1, concept: 1 }, { unique: true });
masterySchema.index({ user: 1, pKnown: 1 });

export default mongoose.model("Mastery", masterySchema);
