import Document from "../models/Document.js";

export const getOwnedDocument = async (documentId, userId) => {
  const document = await Document.findOne({ _id: documentId, user: userId });
  if (!document) {
    const err = new Error("Document not found");
    err.statusCode = 404;
    throw err;
  }
  return document;
};
