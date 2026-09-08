import Quiz from "../models/Quiz.js";

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
    const quizzes = await Quiz.find({ user: req.user._id })
      .select(ANSWER_KEY_EXCLUDE)
      .sort({ createdAt: -1 });
    res.status(200).json(quizzes);
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
    if (!Array.isArray(answers)) {
      res.status(400);
      throw new Error("answers must be an array");
    }

    const quiz = await findOwnedQuiz(req.params.id, req.user._id);

    if (quiz.isCompleted) {
      res.status(409);
      throw new Error("Quiz has already been submitted");
    }

    if (answers.length !== quiz.questions.length) {
      res.status(400);
      throw new Error(`Expected ${quiz.questions.length} answers, got ${answers.length}`);
    }

    const hasInvalidAnswer = answers.some((answer, i) => {
      if (answer === null || answer === undefined) return false;
      return typeof answer !== "string" || !quiz.questions[i].options.includes(answer);
    });
    if (hasInvalidAnswer) {
      res.status(400);
      throw new Error("One or more answers is not a valid option for its question");
    }

    let correct = 0;
    quiz.questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correct += 1;
    });

    const total = quiz.questions.length;
    const score = total ? Math.round((correct / total) * 100) : 0;

    quiz.userAnswers = answers;
    quiz.score = score;
    quiz.isCompleted = true;
    quiz.completedAt = new Date();
    await quiz.save();

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

    const total = quiz.questions.length;
    const correct = quiz.questions.filter((q, i) => quiz.userAnswers[i] === q.correctAnswer).length;

    res.status(200).json({
      title: quiz.title,
      document: quiz.document,
      total,
      correct,
      incorrect: total - correct,
      percentage: quiz.score,
      questions: quiz.questions.map((q, i) => ({
        question: q.question,
        options: q.options,
        userAnswer: quiz.userAnswers[i] ?? null,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        isCorrect: quiz.userAnswers[i] === q.correctAnswer,
      })),
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
