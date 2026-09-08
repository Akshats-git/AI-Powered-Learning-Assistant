import { z } from "zod";
import { requestSchema, objectId } from "./requestSchema.js";

// {questionId, answer} pairs instead of a bare positional array — grading no
// longer assumes the client echoed answers back in question order.
export const submitQuizSchema = requestSchema({
  params: z.object({ id: objectId("id") }),
  body: z.object({
    answers: z.array(
      z.object({
        questionId: objectId("questionId"),
        answer: z.string().nullable().optional(),
      })
    ),
  }),
});
