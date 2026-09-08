import { z } from "zod";
import { requestSchema, objectId } from "./requestSchema.js";

// A bare invalid ObjectId string (e.g. "abc") previously reached
// Document.findOne() and threw an uncaught Mongoose CastError, surfacing as a
// generic 500 instead of a 400. Validating the shape here catches that before
// it ever reaches the database.
const documentIdBody = { documentId: objectId("documentId") };

export const generateFlashcardsSchema = requestSchema({
  body: z.object({
    ...documentIdBody,
    count: z.coerce.number().int().positive().optional(),
  }),
});

export const generateQuizSchema = requestSchema({
  body: z.object({
    ...documentIdBody,
    numQuestions: z.coerce.number().int().positive().optional(),
  }),
});

export const summarySchema = requestSchema({
  body: z.object(documentIdBody),
});

export const explainSchema = requestSchema({
  body: z.object({
    ...documentIdBody,
    concept: z.string().trim().min(1, "A concept is required"),
  }),
});

export const chatSchema = requestSchema({
  body: z.object({
    ...documentIdBody,
    message: z.string().trim().min(1, "A message is required"),
  }),
});

export const chatHistoryParamsSchema = requestSchema({
  params: z.object({ documentId: objectId("documentId") }),
});
