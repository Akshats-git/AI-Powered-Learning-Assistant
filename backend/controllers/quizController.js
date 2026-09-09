import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import { parsePagination, buildPageMeta } from "../utils/pagination.js";

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

    quiz.userAnswers = userAnswers;
    quiz.score = score;
    quiz.isCompleted = true;
    quiz.completedAt = new Date();
    await quiz.save();

    await QuizAttempt.create({
      user: req.user._id,
      quiz: quiz._id,
      document: quiz.document,
      answers: userAnswers,
      total,
      correct,
      score,
    });

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

export const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await findOwnedQuiz(req.params.id, req.user._id);
    await quiz.deleteOne();
    res.status(200).json({ message: "Quiz deleted" });
  } catch (err) {
    next(err);
  }
};
