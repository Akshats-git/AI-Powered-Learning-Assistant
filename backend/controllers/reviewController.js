import Flashcard from "../models/Flashcard.js";
import ReviewLog from "../models/ReviewLog.js";
import { forecastRetention } from "../utils/retentionForecast.js";
import { computeStreak } from "../utils/streaks.js";

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

const FORECAST_DAYS = 90;

// "Chart projected recall over the next 90 days per deck" — one flashcard
// set at a time, since retention is a per-deck story a learner cares about
// ("how well am I retaining *this* material"), not a single number across
// every document they've ever uploaded.
export const getRetentionForecast = async (req, res, next) => {
  try {
    const set = await Flashcard.findOne({ _id: req.params.setId, user: req.user._id }).select("cards").lean();
    if (!set) {
      res.status(404);
      throw new Error("Flashcard set not found");
    }

    const points = forecastRetention(
      set.cards.map((c) => ({ stability: c.schedule?.stability ?? null, lastReviewedAt: c.schedule?.lastReviewedAt ?? null })),
      { days: FORECAST_DAYS }
    );

    res.status(200).json({ setId: set._id, points });
  } catch (err) {
    next(err);
  }
};

// Recomputed from ReviewLog on every request rather than an incrementing
// counter — see utils/streaks.js for why that's the more robust choice.
export const getStreak = async (req, res, next) => {
  try {
    const logs = await ReviewLog.find({ user: req.user._id }).select("reviewedAt").lean();
    const streak = computeStreak(logs.map((l) => l.reviewedAt));

    res.status(200).json(streak);
  } catch (err) {
    next(err);
  }
};
