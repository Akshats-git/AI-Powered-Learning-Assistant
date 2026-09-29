// The provider node (PN, formerly BPP).
//
// Every forward action follows the same asynchronous shape: verify the
// signature, ACK immediately, then send the business result to the consumer
// node's matching `/on_*` endpoint as a separate signed request. The ACK is
// not the answer — it only means the request was accepted.
//
// Callbacks are fired without awaiting so the ACK is not held behind a peer
// that may be slow; a callback that fails is logged and dropped rather than
// retried forever, which is the right MVP trade-off but is the first thing a
// production node would replace with a durable queue.

import express from "express";
import { rawBodyJson, verifySignature, requireContext } from "../core/middleware.js";
import { ACK, NACK_BAD_REQUEST } from "../core/ack.js";
import { replyContext } from "../core/context.js";
import { postSigned } from "../core/client.js";
import { DEFAULT_ITEMS, DEFAULT_PROVIDER, matchItems } from "./catalog.js";

const quoteFor = (items) => ({
  price: {
    currency: "INR",
    value: String(items.reduce((total, item) => total + Number(item.price.value), 0)),
  },
  breakup: items.map((item) => ({ itemId: item.id, title: item.descriptor.name, price: item.price })),
});

export const createBppApp = ({
  identity,
  lookupKey,
  items = DEFAULT_ITEMS,
  provider = DEFAULT_PROVIDER,
  orders = new Map(),
  seenMessageIds = new Set(),
  logger = console,
  fetchImpl = fetch,
  now = Date.now,
}) => {
  const app = express();
  app.use(rawBodyJson());
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use(verifySignature({ lookupKey, now, logger }));

  const callback = async (context, message) => {
    const replyTo = context.senderUri;
    if (!replyTo) return logger.warn?.("beckn bpp: no senderUri to call back to");

    const reply = replyContext(context, { senderUri: identity.uri, now });
    try {
      await postSigned({
        url: `${replyTo}/${reply.action}`,
        payload: { context: reply, message },
        identity,
        fetchImpl,
        now,
      });
    } catch (err) {
      logger.warn?.(`beckn bpp: callback ${reply.action} to ${replyTo} failed — ${err.message}`);
    }
  };

  // A retried request must not create a second order. Beckn's messageId is the
  // idempotency key: the same one means the same request, so it is ACKed again
  // (the peer may simply have missed the first ACK) without re-running the
  // effect. This mirrors the app's existing IdempotencyKey model.
  const isReplay = (context) => {
    const key = `${context.action}:${context.messageId}`;
    if (seenMessageIds.has(key)) return true;
    seenMessageIds.add(key);
    return false;
  };

  const handle = (action, buildMessage) => [
    requireContext(action),
    (req, res) => {
      const { context, message } = req.body;
      res.json(ACK());
      if (isReplay(context)) return logger.info?.(`beckn bpp: replayed ${action} ${context.messageId}, not re-run`);

      let result;
      try {
        result = buildMessage(message || {}, context);
      } catch (err) {
        return logger.warn?.(`beckn bpp: ${action} failed — ${err.message}`);
      }
      callback(context, result);
    },
  ];

  app.post("/discover", ...handle("discover", (message) => ({
    catalog: {
      descriptor: provider.descriptor,
      providers: [{ ...provider, items: matchItems(items, message.intent) }],
    },
  })));

  app.post("/select", ...handle("select", (message) => {
    const selected = (message.order?.items || []).map((selection) => {
      const item = items.find((candidate) => candidate.id === selection.id);
      if (!item) throw new Error(`unknown item ${selection.id}`);
      return item;
    });
    return { order: { provider: { id: provider.id }, items: selected, quote: quoteFor(selected) } };
  }));

  app.post("/init", ...handle("init", (message) => {
    const selected = (message.order?.items || []).map((s) => items.find((i) => i.id === s.id)).filter(Boolean);
    return {
      order: {
        provider: { id: provider.id },
        items: selected,
        billing: message.order?.billing,
        quote: quoteFor(selected),
        fulfillment: { type: "ONLINE", state: { descriptor: { code: "PAYMENT_PENDING" } } },
      },
    };
  }));

  app.post("/confirm", ...handle("confirm", (message, context) => {
    const selected = (message.order?.items || []).map((s) => items.find((i) => i.id === s.id)).filter(Boolean);
    const order = {
      id: `order-${context.transactionId.slice(0, 8)}`,
      provider: { id: provider.id },
      items: selected,
      billing: message.order?.billing,
      quote: quoteFor(selected),
      state: "ACTIVE",
      fulfillment: { type: "ONLINE", state: { descriptor: { code: "ENROLLED" } } },
      createdAt: new Date(now()).toISOString(),
    };
    orders.set(order.id, order);
    return { order };
  }));

  app.post("/status", ...handle("status", (message) => {
    const order = orders.get(message.orderId);
    if (!order) throw new Error(`unknown order ${message.orderId}`);
    return { order };
  }));

  app.use((req, res) => res.status(404).json(NACK_BAD_REQUEST(`unsupported action at ${req.path}`)));

  app.locals.orders = orders;
  return app;
};
