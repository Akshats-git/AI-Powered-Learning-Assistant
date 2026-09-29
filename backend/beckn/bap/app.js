// The consumer node (CN — v2's name for what v1 called a BAP).
//
// Two surfaces, deliberately kept apart:
//
//   /on_*        the network-facing callbacks. Signature-verified, schema-
//                validated, ACKed, and correlated against a pending request.
//   /api/network the app-facing API the React frontend calls. Plain JSON, no
//                signatures — this is the app talking to itself, and it hides
//                the whole ACK-then-callback dance behind one awaited call.
//
// That second surface is the point of a consumer node. The frontend asks for
// material on a concept and gets an array back.

import express from "express";
import { rawBodyJson, verifySignature, validateRequest } from "../core/middleware.js";
import { ack } from "../core/ack.js";
import { buildContext, newMessageId, newTransactionId } from "../core/context.js";
import { postSigned } from "../core/client.js";
import { createTransactionStore } from "./transactions.js";

const CALLBACKS = ["on_discover", "on_select", "on_init", "on_confirm", "on_status"];
const ORDERING_ACTIONS = ["select", "init", "confirm", "status"];

export const createBapApp = ({
  identity,
  lookupKey,
  registry,
  networkId = "beckn.local",
  transactions = createTransactionStore(),
  logger = console,
  fetchImpl = fetch,
  now = Date.now,
}) => {
  const app = express();
  app.use(rawBodyJson());
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Peers address callbacks at the node's root (`{bapUri}/on_discover`), so
  // these sit at the top level — which means signature verification is
  // attached per route rather than with app.use(), or it would also guard the
  // app-facing API below and reject the frontend's own unsigned calls.
  const verify = verifySignature({ lookupKey, now, logger });

  for (const action of CALLBACKS) {
    app.post(`/${action}`, verify, validateRequest(action), (req, res) => {
      const { context, message } = req.body;
      res.json(ack(context));

      if (!transactions.resolve(context.messageId, { context, message })) {
        // Not an error: a provider node answering after the collection window
        // closed lands here, and dropping it is correct.
        logger.info?.(`beckn cn: ${action} ${context.messageId} arrived with nothing waiting for it`);
      }
    });
  }

  // --- protocol actions ----------------------------------------------------

  const send = async ({ action, message, provider, transactionId, expectOne }) => {
    const messageId = newMessageId();
    const context = buildContext({
      action,
      networkId,
      consumer: { id: identity.subscriberId, uri: identity.uri },
      provider: { id: provider.subscriberId, uri: provider.url },
      transactionId,
      messageId,
      now,
    });

    const collected = transactions.open({ messageId, transactionId, action, expectOne });
    const { body } = await postSigned({
      url: `${provider.url}/${action}`,
      payload: { context, message },
      identity,
      fetchImpl,
      now,
    });

    // A NACK means no callback is ever coming — fail now rather than sit out
    // the collection window waiting for one.
    if (body?.message?.status !== "ACK") {
      throw new Error(`${provider.subscriberId} rejected ${action}: ${body?.message?.error?.message || "NACK"}`);
    }
    return collected;
  };

  const providerNodes = () => registry.subscribers({ type: "PN" });

  /** Fans a discovery intent out to every provider node on the subnet. */
  const discover = async (intent) => {
    const providers = await providerNodes();
    if (!providers.length) return { transactionId: null, catalogs: [] };

    const transactionId = newTransactionId();
    const settled = await Promise.allSettled(
      providers.map((provider) =>
        send({
          action: "discover",
          message: { intent },
          provider: { subscriberId: provider.subscriberId, url: provider.url },
          transactionId,
        })
      )
    );

    for (const failure of settled.filter((result) => result.status === "rejected")) {
      logger.warn?.(`beckn cn: discover failed — ${failure.reason?.message}`);
    }

    const collected = await Promise.all(
      settled.filter((result) => result.status === "fulfilled").map((result) => result.value)
    );

    return {
      transactionId,
      catalogs: collected.flat().flatMap((callback) => callback.message?.catalogs || []),
    };
  };

  const orderingAction = async (action, { providerSubscriberId, transactionId, message }) => {
    const provider = (await providerNodes()).find((candidate) => candidate.subscriberId === providerSubscriberId);
    if (!provider) throw new Error(`unknown provider node ${providerSubscriberId}`);

    const collected = await send({
      action,
      message,
      provider: { subscriberId: provider.subscriberId, url: provider.url },
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

  for (const action of ORDERING_ACTIONS) {
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
    logger.error?.(`beckn cn: ${err.message}`);
    res.status(502).json({ error: err.message });
  });

  return Object.assign(app, { discover, orderingAction });
};
