// The consumer node (CN, formerly BAP).
//
// Two distinct surfaces, deliberately kept apart:
//
//   /on_* — the network-facing callbacks. Signature-verified, ACKed, and
//           correlated against a pending transaction.
//   /api/* — the app-facing API the React frontend calls. Plain JSON, no
//           signatures; it is the app talking to itself, and it hides the
//           asynchronous protocol behind one awaited call.
//
// The second is the whole point of a consumer node: the frontend asks for
// courses on a concept and gets an array back, with the ACK/callback dance
// handled here.

import express from "express";
import { rawBodyJson, verifySignature, requireContext } from "../core/middleware.js";
import { ACK } from "../core/ack.js";
import { buildContext, newMessageId } from "../core/context.js";
import { postSigned } from "../core/client.js";
import { createTransactionStore } from "./transactions.js";

const CALLBACKS = ["on_discover", "on_select", "on_init", "on_confirm", "on_status"];

export const createBapApp = ({
  identity,
  lookupKey,
  registry,
  domain = "education",
  networkId = "beckn.local",
  transactions = createTransactionStore(),
  logger = console,
  fetchImpl = fetch,
  now = Date.now,
}) => {
  const app = express();
  app.use(rawBodyJson());
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // --- network-facing callbacks -------------------------------------------

  // Peers address callbacks at the node's root (`{url}/on_discover`), so these
  // sit at the top level — which means signature verification is attached per
  // route rather than with app.use(), or it would also guard the app-facing
  // API below and reject the frontend's own unsigned calls.
  const verify = verifySignature({ lookupKey, now, logger });

  for (const action of CALLBACKS) {
    app.post(`/${action}`, verify, requireContext(action), (req, res) => {
      const { context, message } = req.body;
      res.json(ACK());

      if (!transactions.resolve(context.messageId, { context, message })) {
        // Not an error: a provider node that answered after the collection
        // window closed lands here, and the right thing is to drop it.
        logger.info?.(`beckn bap: ${action} ${context.messageId} arrived with nothing waiting for it`);
      }
    });
  }

  // --- protocol actions ----------------------------------------------------

  const send = async ({ action, message, receiver, transactionId, expectOne }) => {
    const messageId = newMessageId();
    const context = buildContext({
      action,
      domain,
      networkId,
      senderId: identity.subscriberId,
      senderUri: identity.uri,
      receiverId: receiver.subscriberId,
      receiverUri: receiver.url,
      transactionId,
      messageId,
      now,
    });

    const collected = transactions.open({ messageId, transactionId, action, expectOne });
    const { body } = await postSigned({
      url: `${receiver.url}/${action}`,
      payload: { context, message },
      identity,
      fetchImpl,
      now,
    });

    // A NACK means no callback is ever coming — fail now rather than sit out
    // the collection window waiting for one.
    if (body?.message?.ack?.status !== "ACK") {
      throw new Error(`${receiver.subscriberId} rejected ${action}: ${body?.error?.message || "NACK"}`);
    }
    return { transactionId: context.transactionId, collected };
  };

  /** Fans a discovery intent out to every provider node on the network. */
  const discover = async (intent) => {
    const providers = await registry.subscribers({ type: "PN" });
    if (!providers.length) return { transactionId: null, providers: [] };

    const transactionId = buildContext({ action: "discover", domain, networkId, senderId: identity.subscriberId, now }).transactionId;
    const results = await Promise.allSettled(
      providers.map((provider) =>
        send({
          action: "discover",
          message: { intent },
          receiver: { subscriberId: provider.subscriberId, url: provider.url },
          transactionId,
        })
      )
    );

    const collected = await Promise.all(
      results.filter((r) => r.status === "fulfilled").map((r) => r.value.collected)
    );

    for (const failure of results.filter((r) => r.status === "rejected")) {
      logger.warn?.(`beckn bap: discover failed — ${failure.reason?.message}`);
    }

    return {
      transactionId,
      providers: collected.flat().flatMap((callback) => callback.message?.catalog?.providers || []),
    };
  };

  const orderingAction = async (action, { providerSubscriberId, transactionId, message }) => {
    const provider = (await registry.subscribers({ type: "PN" })).find(
      (candidate) => candidate.subscriberId === providerSubscriberId
    );
    if (!provider) throw new Error(`unknown provider node ${providerSubscriberId}`);

    const { collected } = await send({
      action,
      message,
      receiver: { subscriberId: provider.subscriberId, url: provider.url },
      transactionId,
      expectOne: true,
    });
    const [first] = await collected;
    if (!first) throw new Error(`${providerSubscriberId} did not answer ${action} in time`);
    return first.message;
  };

  // --- app-facing API ------------------------------------------------------

  const api = express.Router();
  api.use(express.json());

  api.post("/discover", async (req, res, next) => {
    try {
      res.json(await discover(req.body?.intent || {}));
    } catch (err) {
      next(err);
    }
  });

  for (const action of ["select", "init", "confirm", "status"]) {
    api.post(`/${action}`, async (req, res, next) => {
      try {
        const { providerSubscriberId, transactionId, message } = req.body || {};
        if (!providerSubscriberId || !transactionId) {
          return res.status(400).json({ error: "providerSubscriberId and transactionId are required" });
        }
        res.json(await orderingAction(action, { providerSubscriberId, transactionId, message }));
      } catch (err) {
        next(err);
      }
    });
  }

  app.use("/api/network", api);
  app.use((err, _req, res, _next) => {
    logger.error?.(`beckn bap: ${err.message}`);
    res.status(502).json({ error: err.message });
  });

  return Object.assign(app, { discover, orderingAction });
};
