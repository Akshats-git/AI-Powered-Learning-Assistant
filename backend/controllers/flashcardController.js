import Flashcard from "../models/Flashcard.js";
import ReviewLog from "../models/ReviewLog.js";
import { parsePagination, buildPageMeta } from "../utils/pagination.js";
import { scheduleFsrs, createInitialFsrsState } from "../utils/fsrs.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A never-reviewed card has no `schedule.stability` yet (the default `{}`
// leaves it `null`) — FSRS needs to be told that explicitly rather than
// treating a null stability as zero, which would make its very first
// interval calculation nonsensical.
const scheduleStateFromCard = (card) =>
  card.schedule?.stability == null
    ? createInitialFsrsState()
    : {
        stability: card.schedule.stability,
        difficulty: card.schedule.difficulty,
        reps: card.schedule.reps,
        lapses: card.schedule.lapses,
        lastReviewedAt: card.schedule.lastReviewedAt,
      };

const withProgress = (set) => {
  const obj = set.toObject();
  const totalCards = obj.cards.length;
  const reviewedCount = obj.cards.filter((c) => c.isReviewed).length;
  return {
    ...obj,
    totalCards,
    reviewedCount,
    progressPercent: totalCards ? Math.round((reviewedCount / totalCards) * 100) : 0,
  };
};

const findOwnedSet = async (setId, userId) => {
  const set = await Flashcard.findOne({ _id: setId, user: userId });
  if (!set) {
    const err = new Error("Flashcard set not found");
    err.statusCode = 404;
    throw err;
  }
  return set;
};

export const listFlashcardSets = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [sets, total] = await Promise.all([
      Flashcard.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Flashcard.countDocuments({ user: req.user._id }),
    ]);

    res.status(200).json({
      items: sets.map(withProgress),
      ...buildPageMeta(page, limit, total),
    });
  } catch (err) {
    next(err);
  }
};

export const listFlashcardSetsForDocument = async (req, res, next) => {
  try {
    const sets = await Flashcard.find({ user: req.user._id, document: req.params.documentId }).sort({
      createdAt: -1,
    });
    res.status(200).json(sets.map(withProgress));
  } catch (err) {
    next(err);
  }
};

export const getFlashcardSet = async (req, res, next) => {
  try {
    const set = await findOwnedSet(req.params.setId, req.user._id);
    res.status(200).json(withProgress(set));
  } catch (err) {
    next(err);
  }
};

export const reviewCard = async (req, res, next) => {
  try {
    const { grade } = req.body;
    const set = await findOwnedSet(req.params.setId, req.user._id);
    const card = set.cards.id(req.params.cardId);
    if (!card) {
      res.status(404);
      throw new Error("Card not found");
    }

    const stateBefore = scheduleStateFromCard(card);
    const reviewedAt = new Date();
    const result = scheduleFsrs(stateBefore, grade, reviewedAt);

    card.schedule = {
      stability: result.stability,
      difficulty: result.difficulty,
      reps: result.reps,
      lapses: result.lapses,
      lastReviewedAt: result.lastReviewedAt,
      dueDate: result.dueDate,
    };
    card.isReviewed = true;
    await set.save();

    // An immutable record of the grade itself — the card's `schedule` above
    // only ever holds its *current* state, and the scheduler-comparison
    // experiment (and any future retention chart) needs the full history.
    await ReviewLog.create({
      user: req.user._id,
      flashcardSet: set._id,
      cardId: card._id,
      algorithm: "fsrs",
      grade,
      reviewedAt,
      elapsedDays: stateBefore.lastReviewedAt ? (reviewedAt.getTime() - new Date(stateBefore.lastReviewedAt).getTime()) / MS_PER_DAY : null,
      stateBefore,
      stateAfter: result,
    });

    res.status(200).json(withProgress(set));
  } catch (err) {
    next(err);
  }
};

export const toggleFavoriteCard = async (req, res, next) => {
  try {
    const set = await findOwnedSet(req.params.setId, req.user._id);
    const card = set.cards.id(req.params.cardId);
    if (!card) {
      res.status(404);
      throw new Error("Card not found");
    }

    card.isFavorite = !card.isFavorite;
    await set.save();

    res.status(200).json(withProgress(set));
  } catch (err) {
    next(err);
  }
};

export const deleteFlashcardSet = async (req, res, next) => {
  try {
    const set = await findOwnedSet(req.params.setId, req.user._id);
    await set.deleteOne();
    res.status(200).json({ message: "Flashcard set deleted" });
  } catch (err) {
    next(err);
  }
};
