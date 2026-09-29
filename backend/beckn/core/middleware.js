// Inbound side of the wire, as Express middleware.
//
// `rawBodyJson` replaces express.json() on a Beckn node. The signature covers
// a digest of the bytes that arrived, so those bytes have to be kept — once
// express.json() has produced an object the original serialisation is gone and
// cannot be reconstructed byte for byte.
//
// The two guards run in order and neither calls next() on failure, so a route
// handler only ever sees a request whose sender is known, whose body is
// intact, and whose payload validates against the pinned specification.

import express from "express";
import { verify, SignatureError } from "./signing.js";
import { nackUnauthorized, nackBadRequest, ERROR_CODES } from "./ack.js";
import { validatePayload } from "./validate.js";
import { BECKN_VERSION } from "./context.js";

export const rawBodyJson = () =>
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  });

export const verifySignature = ({ lookupKey, now = Date.now, logger = console }) => async (req, res, next) => {
  try {
    req.becknSender = await verify({
      body: req.rawBody ?? Buffer.alloc(0),
      authorization: req.get("Authorization"),
      lookupKey,
      now,
    });
    next();
  } catch (err) {
    if (err instanceof SignatureError) {
      logger.warn?.(`beckn: rejected ${req.method} ${req.path} — ${err.reason}`);
      return res.status(401).json(nackUnauthorized(req.body?.context, err.reason, err.code));
    }
    next(err);
  }
};

/**
 * Validates the payload against components.schemas in the pinned spec.
 *
 * The action check comes first and separately: beckn.yaml pins
 * `context.action` to a const per path, so a mismatch is a distinct error
 * (CTX_ACTION_MISMATCH) and saying so is more useful to the peer than a
 * generic schema failure.
 */
export const validateRequest = (action) => (req, res, next) => {
  const context = req.body?.context;

  if (!context) {
    return res.status(400).json(nackBadRequest(null, "context is required", ERROR_CODES.CTX_MISSING_FIELD));
  }
  if (context.action !== action) {
    return res
      .status(400)
      .json(nackBadRequest(context, `context.action must be "${action}" on this endpoint`, ERROR_CODES.CTX_ACTION_MISMATCH));
  }
  if (context.version !== BECKN_VERSION) {
    return res
      .status(400)
      .json(nackBadRequest(context, `unsupported protocol version "${context.version}"`, ERROR_CODES.CTX_VERSION_UNSUPPORTED));
  }

  const { valid, errors } = validatePayload(action, req.body);
  if (!valid) {
    return res.status(400).json(nackBadRequest(context, errors, ERROR_CODES.SCH_SCHEMA_VALIDATION_FAILED));
  }
  next();
};
