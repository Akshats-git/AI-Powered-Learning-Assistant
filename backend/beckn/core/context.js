// The Beckn v2 context envelope — the part of every payload that is the same
// whatever the domain is.
//
// v2 renamed the participant identifiers: what v1 called `bapId`/`bppId` are
// now `senderId`/`receiverId` (beckn/protocol-specifications-v2 PR #168, which
// also renamed BAP/BPP to Consumer Node / Provider Node). The pair a callback
// carries is the reverse of the request that triggered it, which `replyContext`
// below exists to get right.
//
// Two identifiers, two jobs, routinely confused:
//   transactionId — one end-to-end user journey (a search through to an order)
//   messageId     — one request/callback pair inside it
// A callback correlates to its request by messageId; everything a user did in
// one sitting correlates by transactionId.

import crypto from "crypto";

export const BECKN_VERSION = "2.0.0";

export const newTransactionId = () => crypto.randomUUID();
export const newMessageId = () => crypto.randomUUID();

export const buildContext = ({
  action,
  domain,
  networkId,
  senderId,
  senderUri,
  receiverId,
  receiverUri,
  transactionId = newTransactionId(),
  messageId = newMessageId(),
  ttl = "PT30S",
  location,
  now = Date.now,
}) => {
  const context = {
    version: BECKN_VERSION,
    action,
    domain,
    networkId,
    senderId,
    senderUri,
    transactionId,
    messageId,
    timestamp: new Date(now()).toISOString(),
    ttl,
  };
  // A /discover goes to the gateway for broadcast and has no single receiver
  // yet; every later action in the journey is addressed to one provider node.
  if (receiverId) context.receiverId = receiverId;
  if (receiverUri) context.receiverUri = receiverUri;
  if (location) context.location = location;
  return context;
};

/**
 * The context for the `on_*` callback answering `context`. Sender and receiver
 * swap, the action gains its `on_` prefix, and both ids carry over so the
 * caller can match the callback to what it asked.
 */
export const replyContext = (context, { senderUri, now = Date.now } = {}) => ({
  ...context,
  action: context.action.startsWith("on_") ? context.action : `on_${context.action}`,
  senderId: context.receiverId,
  senderUri: senderUri || context.receiverUri,
  receiverId: context.senderId,
  receiverUri: context.senderUri,
  timestamp: new Date(now()).toISOString(),
});
