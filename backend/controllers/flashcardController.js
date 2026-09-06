import Flashcard from "../models/Flashcard.js";

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
    const sets = await Flashcard.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(sets.map(withProgress));
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
    const set = await findOwnedSet(req.params.setId, req.user._id);
    const card = set.cards.id(req.params.cardId);
    if (!card) {
      res.status(404);
      throw new Error("Card not found");
    }

    card.isReviewed = true;
    await set.save();

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
