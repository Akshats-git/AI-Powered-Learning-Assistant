import fs from "fs/promises";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import ChatHistory from "../models/ChatHistory.js";
import Chunk from "../models/Chunk.js";
import Mastery from "../models/Mastery.js";
import ReviewLog from "../models/ReviewLog.js";
import LlmCall from "../models/LlmCall.js";
import RefreshToken from "../models/RefreshToken.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import EmailVerificationToken from "../models/EmailVerificationToken.js";
import IdempotencyKey from "../models/IdempotencyKey.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { deleteDocumentData } from "./deleteDocumentData.js";

/**
 * Permanently removes a user and everything of theirs: uploaded files, document text and
 * vectors, decks, quizzes, chats, mastery, review history, spend ledger, sessions, tokens
 * and audit entries. The user row goes last, so a failure part-way leaves an account that
 * can still sign in and retry rather than orphaned data nobody can reach.
 */
export const deleteAccountData = async (userId) => {
  const documents = await Document.find({ user: userId }).select("_id filePath").lean();
  for (const doc of documents) {
    await fs.unlink(doc.filePath).catch(() => {});
    await deleteDocumentData(doc._id);
  }

  const mine = { user: userId };
  await Promise.all([
    Document.deleteMany(mine),
    Flashcard.deleteMany(mine),
    Quiz.deleteMany(mine),
    QuizAttempt.deleteMany(mine),
    ChatHistory.deleteMany(mine),
    Chunk.deleteMany(mine),
    Mastery.deleteMany(mine),
    ReviewLog.deleteMany(mine),
    LlmCall.deleteMany(mine),
    RefreshToken.deleteMany(mine),
    PasswordResetToken.deleteMany(mine),
    EmailVerificationToken.deleteMany(mine),
    IdempotencyKey.deleteMany(mine),
    AuditLog.deleteMany(mine),
  ]);
  await User.deleteOne({ _id: userId });
};

/**
 * Everything the app holds about a user, as one JSON-serialisable object (GDPR-style
 * "download my data"). Extracted PDF text and embedding vectors are left out: they're
 * derived from the user's own files and would make the export enormous.
 */
export const exportAccountData = async (user) => {
  const mine = { user: user._id };
  const [documents, flashcardSets, quizzes, attempts, chats, mastery, reviews] = await Promise.all([
    Document.find(mine).select("title fileSize pageCount textSource createdAt").lean(),
    Flashcard.find(mine).lean(),
    Quiz.find(mine).lean(),
    QuizAttempt.find(mine).lean(),
    ChatHistory.find(mine).lean(),
    Mastery.find(mine).lean(),
    ReviewLog.find(mine).select("-stateBefore -stateAfter").lean(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: { username: user.username, email: user.email, createdAt: user.createdAt, emailVerifiedAt: user.emailVerifiedAt, hasOwnOpenAiKey: Boolean(user.openaiApiKeyLast4) },
    documents,
    flashcardSets,
    quizzes,
    quizAttempts: attempts,
    chats,
    mastery,
    reviewHistory: reviews,
  };
};
