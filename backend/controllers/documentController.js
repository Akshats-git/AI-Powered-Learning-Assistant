import fs from "fs/promises";
import { PDFParse } from "pdf-parse";
import Document from "../models/Document.js";

const extractText = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    await parser.destroy();
  }
};

const toDocumentResponse = (doc) => ({
  ...doc.toObject(),
  fileUrl: `/uploads/${doc.fileName}`,
});

export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      throw new Error("A PDF file is required");
    }
    if (!req.body.title) {
      res.status(400);
      throw new Error("Title is required");
    }

    const extractedText = await extractText(req.file.path);

    const document = await Document.create({
      user: req.user._id,
      title: req.body.title,
      fileName: req.file.filename,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      extractedText,
    });

    res.status(201).json(toDocumentResponse(document));
  } catch (err) {
    next(err);
  }
};

export const listDocuments = async (req, res, next) => {
  try {
    const documents = await Document.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(documents.map(toDocumentResponse));
  } catch (err) {
    next(err);
  }
};

export const getDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, user: req.user._id });
    if (!document) {
      res.status(404);
      throw new Error("Document not found");
    }

    document.lastAccessedAt = new Date();
    await document.save();

    res.status(200).json(toDocumentResponse(document));
  } catch (err) {
    next(err);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, user: req.user._id });
    if (!document) {
      res.status(404);
      throw new Error("Document not found");
    }

    await fs.unlink(document.filePath).catch(() => {});
    await document.deleteOne();

    res.status(200).json({ message: "Document deleted" });
  } catch (err) {
    next(err);
  }
};
