// Acknowledgement envelopes, matching `components.schemas.Ack` and the Nack
// family in the pinned spec.
//
// The shape is flatter than v1's. It is `{ message: { status, messageId } }`,
// not `{ message: { ack: { status } } }`, and a rejection puts its error
// *inside* message rather than beside it. `messageId` is required on every
// response including rejections, so a caller can tell which of its in-flight
// requests was refused.
//
// Beckn is asynchronous: an ACK means "accepted, I will call you back", not
// "here is your answer". A NACK means the request was rejected and no callback
// is ever coming — a caller that waits for one after a NACK hangs until it
// times out.

// From components.schemas.ErrorCode. Only the codes this implementation can
// actually emit are listed; the full enum has ~70.
export const ERROR_CODES = {
  CTX_MISSING_FIELD: "CTX_MISSING_FIELD",
  CTX_INVALID_FIELD: "CTX_INVALID_FIELD",
  CTX_ACTION_MISMATCH: "CTX_ACTION_MISMATCH",
  CTX_VERSION_UNSUPPORTED: "CTX_VERSION_UNSUPPORTED",
  CTX_MESSAGE_ID_DUPLICATE: "CTX_MESSAGE_ID_DUPLICATE",
  AUT_SIGNATURE_MISSING: "AUT_SIGNATURE_MISSING",
  AUT_SIGNATURE_INVALID: "AUT_SIGNATURE_INVALID",
  AUT_SUBSCRIBER_NOT_FOUND: "AUT_SUBSCRIBER_NOT_FOUND",
  AUT_KEY_NOT_FOUND: "AUT_KEY_NOT_FOUND",
  AUT_REPLAY_DETECTED: "AUT_REPLAY_DETECTED",
  SCH_SCHEMA_VALIDATION_FAILED: "SCH_SCHEMA_VALIDATION_FAILED",
  SCH_INVALID_JSON: "SCH_INVALID_JSON",
  NET_INTERNAL_ERROR: "NET_INTERNAL_ERROR",
  NET_NOT_IMPLEMENTED: "NET_NOT_IMPLEMENTED",
  BIZ_ITEM_NOT_FOUND: "BIZ_ITEM_NOT_FOUND",
  BIZ_ORDER_NOT_FOUND: "BIZ_ORDER_NOT_FOUND",
  BIZ_NO_RESULTS_FOUND: "BIZ_NO_RESULTS_FOUND",
};

// A rejection still has to carry a messageId. When the request was so
// malformed that none could be read, a fresh one keeps the response schema-
// valid rather than emitting a response that is itself invalid.
const messageIdOf = (context) => context?.messageId || crypto.randomUUID();

export const ack = (context) => ({
  message: { status: "ACK", messageId: messageIdOf(context) },
});

export const nack = (context, code, message) => ({
  message: { status: "NACK", messageId: messageIdOf(context), error: { code, message } },
});

/** 401. */
export const nackUnauthorized = (context, message, code = ERROR_CODES.AUT_SIGNATURE_INVALID) =>
  nack(context, code, message);

/** 400. */
export const nackBadRequest = (context, message, code = ERROR_CODES.SCH_SCHEMA_VALIDATION_FAILED) =>
  nack(context, code, message);

/** 500. */
export const serverError = (context, message = "Internal server error") =>
  nack(context, ERROR_CODES.NET_INTERNAL_ERROR, message);
