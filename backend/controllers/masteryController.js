import Mastery from "../models/Mastery.js";
import { isMastered } from "../utils/bkt.js";

// The "weak areas" panel: concept mastery driven by inference (BKT), not
// just a tally of right/wrong answers. Optionally scoped to one document via
// `?documentId=`, otherwise every concept the user has ever been quizzed on.
export const listMastery = async (req, res, next) => {
  try {
    const { documentId } = req.query;
    const filter = { user: req.user._id, ...(documentId ? { document: documentId } : {}) };

    const rows = await Mastery.find(filter).sort({ pKnown: 1 }).populate("document", "title").lean();

    const items = rows.map((row) => ({
      concept: row.concept,
      documentId: row.document?._id ?? row.document,
      documentTitle: row.document?.title ?? null,
      pKnown: row.pKnown,
      opportunities: row.opportunities,
      mastered: isMastered(row.pKnown),
      lastUpdatedAt: row.lastUpdatedAt,
    }));

    res.status(200).json({
      items,
      // The weakest concepts are exactly what a "weak areas" panel wants
      // front and center — already sorted ascending by pKnown above.
      weakest: items.filter((i) => !i.mastered).slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
};
