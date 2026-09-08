import { z } from "zod";

// Wraps per-route body/params/query schemas into one shape so a single
// middleware can validate all three parts of a request at once. Any part
// left unspecified is passed through unvalidated.
export const requestSchema = ({ body, params, query } = {}) =>
  z.object({
    body: body ?? z.any(),
    params: params ?? z.any(),
    query: query ?? z.any(),
  });

export const objectId = (label = "id") =>
  z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, `${label} must be a valid id`);

// Shorthand for routes that only need their :param(s) checked as ObjectIds,
// e.g. idParamsSchema("setId", "cardId").
export const idParamsSchema = (...names) =>
  requestSchema({
    params: z.object(Object.fromEntries(names.map((name) => [name, objectId(name)]))),
  });
