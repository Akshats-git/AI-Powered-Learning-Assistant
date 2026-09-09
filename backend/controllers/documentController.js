import fs from "fs/promises";
import { PDFParse } from "pdf-parse";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import Quiz from "../models/Quiz.js";
import { getOwnedDocument } from "../utils/getOwnedDocument.js";
import { parsePagination, buildPageMeta } from "../utils/pagination.js";
import { buildPageMap } from "../utils/pageMap.js";

// A browser-set mimetype is trivially spoofed (rename a .exe to .pdf), so
// confirm the actual bytes before trusting an upload as a PDF.
const PDF_MAGIC_BYTES = Buffer.from("%PDF-");

const isPdfFile = async (filePath) => {
  const fd = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(PDF_MAGIC_BYTES.length);
    await fd.read(header, 0, header.length, 0);
    return header.equals(PDF_MAGIC_BYTES);
  } finally {
    await fd.close();
  }
};

// Returns the per-page text alongside the concatenated string, so the page
// boundaries can be recorded now rather than guessed at later. pdf-parse joins
// pages with a "\n\n" separator, which `buildPageMap` accounts for.
const extractText = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return { text: result.text || "", pages: result.pages || [] };
  } finally {
    await parser.destroy();
  }
};

// Render/Railway wipe local disk on every deploy, so a document's Mongo
// record can outlive its file. Surface that explicitly instead of letting
// the client discover it as a broken PDF viewer with no explanation — the
// extracted text (used for chat/flashcards/quiz) lives in Mongo, so those
// features keep working even when this is true.
const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const toDocumentResponse = async (doc) => {
  // `pageMap` is retrieval machinery, not something a client renders — and on
  // an 800-page PDF it is 800 objects nobody asked for.
  const { extractedText, pageMap, ...rest } = doc.toObject();
  return {
    ...rest,
    fileUrl: `/uploads/${doc.fileName}`,
    fileMissing: !(await fileExists(doc.filePath)),
  };
};

export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      throw new Error("A PDF file is required");
    }

    try {
      if (!req.body.title) {
        res.status(400);
        throw new Error("Title is required");
      }

      if (!(await isPdfFile(req.file.path))) {
        res.status(400);
        throw new Error("Uploaded file is not a valid PDF");
      }

      const { text: extractedText, pages } = await extractText(req.file.path);
      const pageMap = buildPageMap(pages);

      const document = await Document.create({
        user: req.user._id,
        title: req.body.title,
        fileName: req.file.filename,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        extractedText,
        hasExtractedText: Boolean(extractedText && extractedText.trim()),
        pageCount: pageMap.length,
        pageMap,
      });

      res.status(201).json(await toDocumentResponse(document));
    } catch (err) {
      // Multer already wrote the file to disk before this handler ran — don't
      // leave it orphaned just because validation or extraction failed after.
      await fs.unlink(req.file.path).catch(() => {});
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

export const listDocuments = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [documents, total] = await Promise.all([
      Document.find({ user: req.user._id })
        .select("-extractedText -pageMap")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Document.countDocuments({ user: req.user._id }),
    ]);
    const docIds = documents.map((d) => d._id);

    const [flashcardCounts, quizCounts] = await Promise.all([
      Flashcard.aggregate([{ $match: { document: { $in: docIds } } }, { $group: { _id: "$document", count: { $sum: 1 } } }]),
      Quiz.aggregate([{ $match: { document: { $in: docIds } } }, { $group: { _id: "$document", count: { $sum: 1 } } }]),
    ]);

    const flashcardMap = new Map(flashcardCounts.map((f) => [f._id.toString(), f.count]));
    const quizMap = new Map(quizCounts.map((q) => [q._id.toString(), q.count]));

    const items = await Promise.all(
      documents.map(async (doc) => ({
        ...(await toDocumentResponse(doc)),
        flashcardCount: flashcardMap.get(doc._id.toString()) || 0,
        quizCount: quizMap.get(doc._id.toString()) || 0,
      }))
    );

    res.status(200).json({
      items,
      ...buildPageMeta(page, limit, total),
    });
  } catch (err) {
    next(err);
  }
};

export const getDocument = async (req, res, next) => {
  try {
    const document = await getOwnedDocument(req.params.id, req.user._id);

    const lastAccessedAt = new Date();
    await Document.updateOne({ _id: document._id }, { $set: { lastAccessedAt } });
    document.lastAccessedAt = lastAccessedAt;

    res.status(200).json(await toDocumentResponse(document));
  } catch (err) {
    next(err);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const document = await getOwnedDocument(req.params.id, req.user._id);

    await fs.unlink(document.filePath).catch(() => {});
    await document.deleteOne();

    res.status(200).json({ message: "Document deleted" });
  } catch (err) {
    next(err);
  }
};
