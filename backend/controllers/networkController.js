// The app-facing side of the Beckn consumer node.
//
// These endpoints hide the protocol entirely. The frontend asks for material
// on a concept and awaits an array; the ACK, the callback on a separate
// connection and the collection window all happen underneath.

import { getBecknNode, isBecknConfigured } from "../utils/becknNode.js";
import { conceptFilter } from "../beckn/bpp/catalog.js";
import Mastery from "../models/Mastery.js";
import { isMastered } from "../utils/bkt.js";

const NOT_CONFIGURED = {
  message: "This deployment is not on a Beckn subnet. See docs/beckn.md to join one.",
};

const requireNode = (res) => {
  const node = getBecknNode();
  if (!node) {
    res.status(503).json(NOT_CONFIGURED);
    return null;
  }
  return node;
};

export const networkStatus = (req, res) => {
  res.json({ configured: isBecknConfigured() });
};

/**
 * Search the subnet. `concept` becomes a JSONPath filter over resource
 * attributes; `text` becomes a free-text intent. Both may be sent.
 */
export const discover = async (req, res, next) => {
  const node = requireNode(res);
  if (!node) return;

  try {
    const { concept, text } = req.body || {};
    if (!concept && !text) {
      res.status(400);
      return next(new Error("Provide a concept or some search text"));
    }

    const intent = {};
    if (concept) intent.filters = conceptFilter(concept);
    if (text) intent.textSearch = text;

    res.json(await node.discover(intent));
  } catch (err) {
    next(err);
  }
};

/**
 * The learner's weakest concepts, as search suggestions.
 *
 * Same BKT estimate the dashboard's weak-areas panel uses, deduplicated
 * across documents — a concept the learner meets in three PDFs is still one
 * thing to go and learn.
 */
export const suggestions = async (req, res, next) => {
  try {
    const rows = await Mastery.find({ user: req.user._id }).sort({ pKnown: 1 }).lean();

    const weakest = [];
    const seen = new Set();
    for (const row of rows) {
      if (isMastered(row.pKnown) || seen.has(row.concept)) continue;
      seen.add(row.concept);
      weakest.push({ concept: row.concept, pKnown: row.pKnown });
      if (weakest.length === 6) break;
    }
    res.json({ concepts: weakest });
  } catch (err) {
    next(err);
  }
};

const contractAction = (action) => async (req, res, next) => {
  const node = requireNode(res);
  if (!node) return;

  try {
    const { providerSubscriberId, transactionId, message } = req.body || {};
    if (!providerSubscriberId || !transactionId) {
      res.status(400);
      return next(new Error("providerSubscriberId and transactionId are required"));
    }
    res.json(await node.orderingAction(action, { providerSubscriberId, transactionId, message }));
  } catch (err) {
    next(err);
  }
};

export const select = contractAction("select");
export const init = contractAction("init");
export const confirm = contractAction("confirm");
export const status = contractAction("status");
