// Validates { body, params, query } against a Zod schema built with
// requestSchema(), and replaces req.body/params/query with the parsed
// (trimmed/coerced) values so controllers can trust their shape instead of
// re-checking `if (!field)` themselves.
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    const err = new Error("Validation failed");
    err.statusCode = 400;
    err.code = "VALIDATION_ERROR";
    err.details = result.error.issues.map((issue) => ({
      path: issue.path.slice(1).join(".") || issue.path[0],
      message: issue.message,
    }));
    return next(err);
  }

  // req.query is a getter-only property in Express 5 — validate it, but only
  // body/params can actually be written back with their parsed values.
  req.body = result.data.body;
  req.params = result.data.params;
  next();
};
