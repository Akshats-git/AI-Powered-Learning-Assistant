import Chunk from "../models/Chunk.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import ChatHistory from "../models/ChatHistory.js";
import Mastery from "../models/Mastery.js";
import GenerationCache from "../models/GenerationCache.js";

// Everything derived from a document's content. Deleting only the Document row
// used to leave its chunks (full text plus vectors), chat history, cached
// generations, flashcards and quizzes behind — retaining text the user had
// asked to delete, and leaving the dashboard, due queue and quiz list
// pointing at a document that no longer exists.
//
// ReviewLog is deliberately kept: it's an immutable record of grades already
// given (streaks are computed from it) and only references the flashcard set,
// never the document.
export const deleteDocumentData = async (documentId) => {
  const filter = { document: documentId };
  await Promise.all([
    Chunk.deleteMany(filter),
    Flashcard.deleteMany(filter),
    Quiz.deleteMany(filter),
    QuizAttempt.deleteMany(filter),
    ChatHistory.deleteMany(filter),
    Mastery.deleteMany(filter),
    GenerationCache.deleteMany(filter),
  ]);
};
