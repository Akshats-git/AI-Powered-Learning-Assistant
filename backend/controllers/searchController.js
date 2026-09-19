import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import ChatHistory from "../models/ChatHistory.js";

const PER_GROUP = 5;
const SNIPPET_RADIUS = 60;

// The query is user input going into a regex: escape it so "a.*b" or "(" is
// searched for literally, not interpreted (and can't be used for ReDoS).
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const snippetAround = (text, re) => {
  const at = text.search(re);
  if (at === -1) return text.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + SNIPPET_RADIUS * 2);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
};

/**
 * GET /api/search?q= — everything of the caller's that mentions `q`, in four
 * groups (documents, decks/cards, quizzes, chat), at most 5 each. Personal-scale
 * data, so a scoped case-insensitive substring match is simpler and more
 * predictable than a ranking engine, and it never looks outside `req.user`.
 *
 * Quizzes match on title and question text only: the answer key is never searched
 * or returned (see quizController.stripAnswers).
 */
export const search = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2 || q.length > 100) {
      res.status(400);
      throw new Error("Search needs 2 to 100 characters");
    }

    const re = new RegExp(escapeRegex(q), "i");
    const user = req.user._id;

    const [documents, decks, quizzes, chats] = await Promise.all([
      Document.find({ user, title: re }).select("title createdAt").sort({ lastAccessedAt: -1 }).limit(PER_GROUP).lean(),
      Flashcard.find({ user, $or: [{ title: re }, { "cards.question": re }, { "cards.answer": re }] })
        .select("title document cards.question cards.answer")
        .sort({ createdAt: -1 })
        .limit(PER_GROUP)
        .lean(),
      Quiz.find({ user, $or: [{ title: re }, { "questions.question": re }] }).select("title document isCompleted questions.question").sort({ createdAt: -1 }).limit(PER_GROUP).lean(),
      ChatHistory.find({ user, "messages.content": re }).select("document messages.role messages.content").populate("document", "title").sort({ updatedAt: -1 }).limit(PER_GROUP).lean(),
    ]);

    res.status(200).json({
      query: q,
      documents: documents.map((d) => ({ id: d._id, title: d.title })),
      flashcards: decks.map((d) => {
        const card = d.cards.find((c) => re.test(c.question) || re.test(c.answer));
        return { id: d._id, title: d.title, documentId: d.document, ...(card ? { card: { question: card.question, snippet: snippetAround(re.test(card.answer) ? card.answer : card.question, re) } } : {}) };
      }),
      quizzes: quizzes.map((z) => {
        const question = z.questions.find((x) => re.test(x.question));
        return { id: z._id, title: z.title, documentId: z.document, isCompleted: z.isCompleted, ...(question ? { question: snippetAround(question.question, re) } : {}) };
      }),
      chats: chats
        .map((c) => {
          const message = c.messages.find((m) => re.test(m.content));
          return message && c.document ? { documentId: c.document._id, documentTitle: c.document.title, role: message.role, snippet: snippetAround(message.content, re) } : null;
        })
        .filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
};
