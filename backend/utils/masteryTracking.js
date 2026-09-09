import Mastery from "../models/Mastery.js";
import { updateMastery, BKT_DEFAULT_PARAMETERS } from "./bkt.js";

// Turns one graded quiz submission into BKT mastery updates — one per
// concept a question was tagged with (utils/prompts.js's quizPrompt asks the
// model to tag each question; older quizzes generated before that shipped
// just have `concept: null` and are silently skipped here, same as any
// question the model chose not to tag).
//
// A question's `concept` string is treated as an opaque key — no attempt is
// made to merge "backpropagation" and "back-propagation" as the same
// concept. That's a real limitation (see the roadmap's fuller "concept
// graph" vision), but a wrong split just means two mastery rows track what
// is really one idea, not a wrong or misleading estimate.
export const recordQuizMastery = async ({ userId, documentId, questions, answerByQuestionId }) => {
  const taggedQuestions = questions.filter((q) => q.concept);
  if (taggedQuestions.length === 0) return;

  for (const question of taggedQuestions) {
    const answer = answerByQuestionId.get(question._id.toString());
    const correct = answer != null && answer === question.correctAnswer;

    const existing = await Mastery.findOne({ user: userId, document: documentId, concept: question.concept });
    const pKnownBefore = existing ? existing.pKnown : BKT_DEFAULT_PARAMETERS.prior;
    const pKnownAfter = updateMastery(pKnownBefore, correct);

    await Mastery.findOneAndUpdate(
      { user: userId, document: documentId, concept: question.concept },
      { $set: { pKnown: pKnownAfter, lastUpdatedAt: new Date() }, $inc: { opportunities: 1 } },
      { upsert: true }
    );
  }
};
