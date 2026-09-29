// The Beckn v2 context envelope, as `components.schemas.Context` defines it.
//
// Field names here were checked against the pinned spec rather than carried
// over from v1, which matters more than it sounds — three things differ from
// what most v1-era material describes:
//
//   - There is no `domain`. A transaction is scoped by `networkId` (which
//     subnet it happens on) and by `schemaContext` (which JSON-LD schemas its
//     payloads use). Domain lives in the data, not the envelope.
//   - `bapId`/`bppId` were NOT replaced by `senderId`/`receiverId`. They
//     coexist and mean different things: bapId/bppId are verified namespace
//     identifiers on dedi.global used to resolve addresses and keys, while
//     senderId/receiverId are DIDs used for message-level verification.
//   - `bapUri` is where callbacks are delivered; `bppUri` is where requests
//     are sent. Both must match the subscriber_url from a registry lookup.
//
// Two identifiers, two jobs:
//   transactionId — one journey, discover through confirm, assigned by the CN
//   messageId     — one request and its matching callback
// The spec is explicit that the CN MUST correlate callbacks by messageId.

import crypto from "crypto";

export const BECKN_VERSION = "2.0.0";

export const newTransactionId = () => crypto.randomUUID();
export const newMessageId = () => crypto.randomUUID();

/**
 * @param consumer { id, uri } of the consumer node — becomes bapId/bapUri.
 * @param provider { id, uri } of the provider node — becomes bppId/bppUri.
 *   Omitted for /discover, which goes out before any one provider is known.
 */
export const buildContext = ({
  action,
  networkId,
  consumer,
  provider,
  senderId,
  receiverId,
  transactionId = newTransactionId(),
  messageId = newMessageId(),
  ttl = "PT30S",
  schemaContext,
  now = Date.now,
}) => {
  const context = {
    version: BECKN_VERSION,
    action,
    networkId,
    transactionId,
    messageId,
    timestamp: new Date(now()).toISOString(),
    ttl,
  };

  if (consumer?.id) context.bapId = consumer.id;
  if (consumer?.uri) context.bapUri = consumer.uri;
  if (provider?.id) context.bppId = provider.id;
  if (provider?.uri) context.bppUri = provider.uri;
  if (senderId) context.senderId = senderId;
  if (receiverId) context.receiverId = receiverId;
  if (schemaContext) context.schemaContext = schemaContext;

  return context;
};

/**
 * The context for the `on_*` callback answering `context`.
 *
 * bapId/bapUri and bppId/bppUri do NOT swap — they name roles, not direction,
 * and the consumer node is still the consumer node when it is being called
 * back. Only senderId/receiverId flip, because those describe this particular
 * message. messageId carries over; that is what the caller correlates on.
 */
export const replyContext = (context, { now = Date.now } = {}) => {
  const reply = {
    ...context,
    action: context.action.startsWith("on_") ? context.action : `on_${context.action}`,
    timestamp: new Date(now()).toISOString(),
  };

  if (context.senderId || context.receiverId) {
    reply.senderId = context.receiverId;
    reply.receiverId = context.senderId;
    if (!reply.senderId) delete reply.senderId;
    if (!reply.receiverId) delete reply.receiverId;
  }
  return reply;
};

/** Where a callback for this context should be delivered. */
export const callbackUrlFor = (context) => context.bapUri;
