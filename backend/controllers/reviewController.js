import Flashcard from "../models/Flashcard.js";

const DEFAULT_QUEUE_LIMIT = 20;
const MAX_QUEUE_LIMIT = 100;

// The whole point of a unified queue: everything due today across every
// document, interleaved — not "go review this document's deck, then that
// one's." A user's total card count is small enough (a personal study app,
// not a fleet at scale) that fetching every set and sorting in memory is
// simpler and more correct than trying to express "due or never scheduled"
// as one Mongo query across a subdocument array — a legacy card from before
// `schedule` existed has no `schedule.dueDate` to query on at the database
// level at all, but is still very much due.
export const getDueQueue = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_QUEUE_LIMIT, MAX_QUEUE_LIMIT);
    const now = new Date();

    const sets = await Flashcard.find({ user: req.user._id })
      .select("title document cards")
      .populate("document", "title")
      .lean();

    const due = [];
    for (const set of sets) {
      for (const card of set.cards) {
        const dueDate = card.schedule?.dueDate ?? new Date(0);
        if (new Date(dueDate) > now) continue;

        due.push({
          flashcardSetId: set._id,
          flashcardSetTitle: set.title,
          documentId: set.document?._id ?? set.document,
          documentTitle: set.document?.title ?? null,
          cardId: card._id,
          question: card.question,
          answer: card.answer,
          dueDate,
          reps: card.schedule?.reps || 0,
          isNew: !card.schedule || card.schedule.reps === 0,
        });
      }
    }

    // Oldest-overdue-first — a card that's been waiting longest gets seen
    // first, same instinct as any other queue.
    due.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    res.status(200).json({ items: due.slice(0, limit), total: due.length });
  } catch (err) {
    next(err);
  }
};
