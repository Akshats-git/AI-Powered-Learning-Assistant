import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import { parsePagination, buildPageMeta } from "../utils/pagination.js";
import { recordQuizMastery } from "../utils/masteryTracking.js";
import { quizResultsToMarkdown, safeFilename } from "../utils/exporters.js";

const findOwnedQuiz = async (quizId, userId) => {
  const quiz = await Quiz.findOne({ _id: quizId, user: userId });
  if (!quiz) {
    const err = new Error("Quiz not found");
    err.statusCode = 404;
    throw err;
  }
  return quiz;
};

const stripAnswers = (quiz) => {
  const obj = quiz.toObject();
  return {
    ...obj,
    questions: obj.questions.map(({ correctAnswer, explanation, ...rest }) => rest),
  };
};

const ANSWER_KEY_EXCLUDE = "-questions.correctAnswer -questions.explanation";

export const listQuizzes = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [quizzes, total] = await Promise.all([
      Quiz.find({ user: req.user._id })
        .select("title isCompleted score completedAt createdAt document questions")
        .populate("document", "title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Quiz.countDocuments({ user: req.user._id }),
    ]);

    // The list view never needs question text (or the answer key riding
    // along inside it) — just how many there are.
    const items = quizzes.map((quiz) => {
      const { questions, ...rest } = quiz.toObject();
      return { ...rest, questionCount: questions.length };
    });

    res.status(200).json({
      items,
      ...buildPageMeta(page, limit, total),
    });
  } catch (err) {
    next(err);
  }
};

export const listQuizzesForDocument = async (req, res, next) => {
  try {
    const quizzes = await Quiz.find({ user: req.user._id, document: req.params.documentId })
      .select(ANSWER_KEY_EXCLUDE)
      .sort({ createdAt: -1 });
    res.status(200).json(quizzes);
  } catch (err) {
    next(err);
  }
};

export const getQuiz = async (req, res, next) => {
  try {
    const quiz = await findOwnedQuiz(req.params.id, req.user._id);
    res.status(200).json(stripAnswers(quiz));
  } catch (err) {
    next(err);
  }
};

export const submitQuiz = async (req, res, next) => {
  try {
    const { answers } = req.body;
    const quiz = await findOwnedQuiz(req.params.id, req.user._id);

    if (quiz.isCompleted) {
      res.status(409);
      throw new Error("Quiz has already been submitted");
    }

    const hasUnknownQuestion = answers.some((a) => !quiz.questions.id(a.questionId));
    if (hasUnknownQuestion) {
      res.status(400);
      throw new Error("One or more answers reference a question that isn't on this quiz");
    }

    const answerByQuestionId = new Map(answers.map((a) => [a.questionId, a.answer ?? null]));

    const hasInvalidAnswer = quiz.questions.some((q) => {
      const answer = answerByQuestionId.get(q._id.toString());
      if (answer === null || answer === undefined) return false;
      return !q.options.includes(answer);
    });
    if (hasInvalidAnswer) {
      res.status(400);
      throw new Error("One or more answers is not a valid option for its question");
    }

    let correct = 0;
    const userAnswers = quiz.questions.map((q) => {
      const answer = answerByQuestionId.get(q._id.toString()) ?? null;
      if (answer === q.correctAnswer) correct += 1;
      return { questionId: q._id, answer };
    });

    const total = quiz.questions.length;
    const score = total ? Math.round((correct / total) * 100) : 0;

    // One atomic "claim": the isCompleted filter means that of two simultaneous
    // submits only one matches, so a double click can't grade (and record
    // mastery for) the same quiz twice.
    const claimed = await Quiz.findOneAndUpdate(
      { _id: quiz._id, user: req.user._id, isCompleted: false },
      { $set: { userAnswers, score, isCompleted: true, completedAt: new Date() } }
    );
    if (!claimed) {
      res.status(409);
      throw new Error("Quiz has already been submitted");
    }

    await QuizAttempt.create({
      user: req.user._id,
      quiz: quiz._id,
      document: quiz.document,
      answers: userAnswers,
      total,
      correct,
      score,
    });

    // Best-effort: a mastery-tracking failure shouldn't fail an otherwise
    // successful submission — the score is already saved either way.
    try {
      await recordQuizMastery({ userId: req.user._id, documentId: quiz.document, questions: quiz.questions, answerByQuestionId });
    } catch {
      // swallow — mastery is a secondary signal, not part of grading itself
    }

    res.status(200).json({
      total,
      correct,
      incorrect: total - correct,
      percentage: score,
    });
  } catch (err) {
    next(err);
  }
};

export const getQuizResults = async (req, res, next) => {
  try {
    const quiz = await findOwnedQuiz(req.params.id, req.user._id);

    if (!quiz.isCompleted) {
      res.status(400);
      throw new Error("Quiz has not been submitted yet");
    }

    const answerByQuestionId = new Map(quiz.userAnswers.map((a) => [a.questionId.toString(), a.answer]));
    const total = quiz.questions.length;
    let correct = 0;

    const questions = quiz.questions.map((q) => {
      const userAnswer = answerByQuestionId.get(q._id.toString()) ?? null;
      const isCorrect = userAnswer === q.correctAnswer;
      if (isCorrect) correct += 1;
      return {
        question: q.question,
        options: q.options,
        userAnswer,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        isCorrect,
      };
    });

    res.status(200).json({
      title: quiz.title,
      document: quiz.document,
      total,
      correct,
      incorrect: total - correct,
      percentage: quiz.score,
      questions,
    });
  } catch (err) {
    next(err);
  }
};

// Markdown of a *finished* quiz with the answer key — an unfinished quiz's key
// must never leave the server (see stripAnswers), so it can't be exported.
export const exportQuiz = async (req, res, next) => {
  try {
    const quiz = await findOwnedQuiz(req.params.id, req.user._id);
    if (!quiz.isCompleted) {
      res.status(400);
      throw new Error("Finish the quiz before exporting it");
    }

    const answerByQuestionId = new Map(quiz.userAnswers.map((a) => [a.questionId.toString(), a.answer]));
    const questions = quiz.questions.map((q) => ({ question: q.question, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation, userAnswer: answerByQuestionId.get(q._id.toString()) ?? null }));
    const correct = questions.filter((q) => q.userAnswer === q.correctAnswer).length;

    res
      .status(200)
      .set("Content-Type", "text/markdown; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="${safeFilename(quiz.title, "md")}"`)
      .send(quizResultsToMarkdown({ title: quiz.title, percentage: quiz.score, correct, total: questions.length, questions }));
  } catch (err) {
    next(err);
  }
};

// POST /api/quizzes/:id/retake — a fresh, unanswered copy of a finished quiz. A new Quiz
// (not a reset of the old one) so the previous score and its attempt history stay intact.
export const retakeQuiz = async (req, res, next) => {
  try {
    const source = await findOwnedQuiz(req.params.id, req.user._id);
    if (!source.isCompleted) {
      res.status(400);
      throw new Error("Finish this quiz before retaking it");
    }

    const copy = await Quiz.create({
      user: req.user._id,
      document: source.document,
      title: source.title,
      questions: source.questions.map(({ question, options, correctAnswer, explanation, concept }) => ({ question, options, correctAnswer, explanation, concept })),
    });
    res.status(201).json(stripAnswers(copy));
  } catch (err) {
    next(err);
  }
};

export const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await findOwnedQuiz(req.params.id, req.user._id);
    await quiz.deleteOne();
    res.status(200).json({ message: "Quiz deleted" });
  } catch (err) {
    next(err);
  }
};
