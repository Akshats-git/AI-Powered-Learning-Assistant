// Inbound side of the wire, as Express middleware.
//
// `rawBodyJson` replaces express.json() on a Beckn node. The signature covers
// a digest of the bytes that arrived, so those bytes have to be kept — by the
// time express.json() has produced an object the original serialisation is
// gone and cannot be reconstructed.
//
// `verifySignature` runs before every handler. It answers an unverifiable
// request with 401 NackUnauthorized and never calls next(), so a route handler
// only ever sees a request whose sender is known and whose body is intact.

import express from "express";
import { verify, SignatureError } from "./signing.js";
import { NACK_UNAUTHORIZED, NACK_BAD_REQUEST } from "./ack.js";

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
      return res.status(401).json(NACK_UNAUTHORIZED(err.reason));
    }
    next(err);
  }
};

// Minimal context check. The full contract is beckn.yaml; this covers the
// fields every handler here dereferences, so a malformed payload fails as a
// clean 400 NackBadRequest instead of a TypeError deep in a handler.
const REQUIRED_CONTEXT_FIELDS = ["version", "action", "domain", "transactionId", "messageId", "senderId"];

export const requireContext = (expectedAction) => (req, res, next) => {
  const context = req.body?.context;
  if (!context) return res.status(400).json(NACK_BAD_REQUEST("context is required"));

  const missing = REQUIRED_CONTEXT_FIELDS.filter((field) => !context[field]);
  if (missing.length) return res.status(400).json(NACK_BAD_REQUEST(`context is missing: ${missing.join(", ")}`));

  // beckn.yaml requires context.action to match the endpoint it arrived on.
  if (expectedAction && context.action !== expectedAction) {
    return res.status(400).json(NACK_BAD_REQUEST(`context.action must be "${expectedAction}" on this endpoint`));
  }
  next();
};
