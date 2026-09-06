import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";

export const getOverview = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [totalDocuments, totalQuizzes, cardsAgg, recentDocuments] = await Promise.all([
      Document.countDocuments({ user: userId }),
      Quiz.countDocuments({ user: userId }),
      Flashcard.aggregate([
        { $match: { user: userId } },
        { $project: { cardCount: { $size: "$cards" } } },
        { $group: { _id: null, total: { $sum: "$cardCount" } } },
      ]),
      Document.find({ user: userId }).sort({ lastAccessedAt: -1 }).limit(5),
    ]);

    const totalFlashcards = cardsAgg[0]?.total || 0;

    const recentActivity = recentDocuments.map((doc) => ({
      label: doc.title,
      timestamp: doc.lastAccessedAt,
      link: `/documents/${doc._id}`,
    }));

    res.status(200).json({ totalDocuments, totalFlashcards, totalQuizzes, recentActivity });
  } catch (err) {
    next(err);
  }
};
