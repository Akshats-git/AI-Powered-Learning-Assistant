import crypto from "crypto";
import IdempotencyKey from "../models/IdempotencyKey.js";

const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

const problem = (res, status, code, message) => res.status(status).json({ error: { code, message, requestId: res.req?.id } });

/**
 * Honors an `Idempotency-Key` header on a mutating route. No header = the
 * route behaves exactly as before, so this is opt-in for clients.
 *
 *  - first request with a key: runs normally; a 2xx response is stored
 *  - same key + same request again: the stored response is replayed
 *    (`Idempotent-Replay: true`), the handler is NOT run, nothing is billed
 *  - same key while the first is still running: 409
 *  - same key, different request: 422
 *  - a non-2xx outcome releases the key, so the client can fix and retry
 */
export const idempotent = async (req, res, next) => {
  const key = req.get("Idempotency-Key");
  if (!key) return next();
  if (!KEY_PATTERN.test(key)) {
    return problem(res, 400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8-128 characters: letters, digits, and _ - : .");
  }

  try {
    const requestHash = crypto.createHash("sha256").update(`${req.method} ${req.baseUrl}${req.path} ${JSON.stringify(req.body ?? {})}`).digest("hex");

    try {
      await IdempotencyKey.create({ user: req.user._id, key, requestHash });
    } catch (err) {
      if (err.code !== 11000) throw err;

      const existing = await IdempotencyKey.findOne({ user: req.user._id, key }).lean();
      // Expired between the failed insert and this read: treat as a fresh request.
      if (!existing) return idempotent(req, res, next);
      if (existing.requestHash !== requestHash) {
        return problem(res, 422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
      }
      if (existing.status === "in_progress") {
        return problem(res, 409, "REQUEST_IN_PROGRESS", "A request with this Idempotency-Key is still in progress.");
      }
      res.set("Idempotent-Replay", "true");
      return res.status(existing.responseStatus).json(existing.responseBody);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const succeeded = res.statusCode >= 200 && res.statusCode < 300;
      const settle = succeeded
        ? IdempotencyKey.updateOne({ user: req.user._id, key }, { $set: { status: "completed", responseStatus: res.statusCode, responseBody: JSON.parse(JSON.stringify(body)) } })
        : IdempotencyKey.deleteOne({ user: req.user._id, key });
      // Settled before the response is sent, so a client that retries the instant
      // it sees the reply always finds the final state.
      settle.catch(() => {}).finally(() => originalJson(body));
      return res;
    };

    // Client hung up / handler threw before responding: free the key instead of leaving it "in progress" for a day.
    res.on("close", () => {
      if (!res.writableEnded) IdempotencyKey.deleteOne({ user: req.user._id, key, status: "in_progress" }).catch(() => {});
    });

    return next();
  } catch (err) {
    return next(err);
  }
};
