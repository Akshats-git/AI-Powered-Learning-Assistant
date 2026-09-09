import { z } from "zod";
import { requestSchema, objectId } from "./requestSchema.js";

export const GRADES = ["again", "hard", "good", "easy"];

export const reviewCardSchema = requestSchema({
  params: z.object({ setId: objectId("setId"), cardId: objectId("cardId") }),
  body: z.object({ grade: z.enum(GRADES) }),
});

export const dueQueueSchema = requestSchema({
  query: z.object({
    limit: z.coerce.number().int().positive().optional(),
  }),
});
