// The provider node (PN — v2's name for what v1 called a BPP).
//
// Every forward action has the same asynchronous shape: verify the signature,
// validate against the pinned schema, ACK, then deliver the business result to
// the consumer node's matching `/on_*` endpoint as a separate signed request.
// The ACK is not the answer.
//
// Callbacks go to `context.bapUri`, which the spec requires to match the
// subscriber_url from a registry lookup. They are validated before being sent:
// emitting an invalid callback is this node's own bug, and it should be caught
// here rather than by the peer.

import crypto from "crypto";
import express from "express";
import { rawBodyJson, verifySignature, validateRequest } from "../core/middleware.js";
import { ack, nackBadRequest, ERROR_CODES } from "../core/ack.js";
import { replyContext, callbackUrlFor } from "../core/context.js";
import { postSigned } from "../core/client.js";
import { validateMessage } from "../core/validate.js";
import {
  DEFAULT_RESOURCES,
  DEFAULT_OFFERS,
  DEFAULT_PROVIDER,
  matchResources,
  buildCatalog,
  priceOf,
  UnsupportedFilterError,
} from "./catalog.js";

const BILLING_CONTEXT = "https://schema.org";

const considerationFor = (offers) => {
  const total = offers.reduce((sum, offer) => sum + priceOf(offer).value, 0);
  return [
    {
      id: "total",
      considerationAttributes: {
        "@context": BILLING_CONTEXT,
        "@type": "PriceSpecification",
        priceCurrency: offers[0] ? priceOf(offers[0]).currency : "INR",
        price: String(total),
      },
    },
  ];
};

export const createBppApp = ({
  identity,
  lookupKey,
  resources = DEFAULT_RESOURCES,
  offers = DEFAULT_OFFERS,
  provider = DEFAULT_PROVIDER,
  contracts = new Map(),
  seenMessageIds = new Set(),
  logger = console,
  fetchImpl = fetch,
  now = Date.now,
}) => {
  const app = express();
  app.use(rawBodyJson());
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use(verifySignature({ lookupKey, now, logger }));

  // Resolves what the consumer selected into the resources and offers it
  // names, failing loudly on anything unknown.
  const resolveSelection = (contract) => {
    const commitments = contract?.commitments || [];
    const chosenResources = [];
    const chosenOffers = [];

    for (const commitment of commitments) {
      for (const requested of commitment.resources || []) {
        const resource = resources.find((candidate) => candidate.id === requested.id);
        if (!resource) throw Object.assign(new Error(`unknown resource ${requested.id}`), { code: ERROR_CODES.BIZ_ITEM_NOT_FOUND });
        chosenResources.push({ ...resource, quantity: requested.quantity ?? 1 });
      }
      const offer = offers.find((candidate) => candidate.id === commitment.offer?.id);
      if (!offer) throw Object.assign(new Error(`unknown offer ${commitment.offer?.id}`), { code: ERROR_CODES.BIZ_OFFER_NOT_FOUND });
      chosenOffers.push(offer);
    }
    return { chosenResources, chosenOffers };
  };

  const commitmentsFrom = (chosenResources, chosenOffers, statusCode) =>
    chosenOffers.map((offer, index) => ({
      id: `commitment-${index + 1}`,
      status: { descriptor: { code: statusCode } },
      resources: chosenResources
        .filter((resource) => offer.resourceIds.includes(resource.id))
        .map((resource) => ({ id: resource.id, descriptor: resource.descriptor, quantity: resource.quantity })),
      offer: { id: offer.id, resourceIds: offer.resourceIds },
    }));

  const deliver = async (context, message) => {
    const reply = replyContext(context, { now });
    const url = callbackUrlFor(context);
    if (!url) return logger.warn?.("beckn pn: no bapUri to call back to");

    const { valid, errors } = validateMessage(reply.action, message);
    if (!valid) return logger.error?.(`beckn pn: refusing to send invalid ${reply.action} — ${errors}`);

    try {
      await postSigned({ url: `${url}/${reply.action}`, payload: { context: reply, message }, identity, fetchImpl, now });
    } catch (err) {
      logger.warn?.(`beckn pn: callback ${reply.action} to ${url} failed — ${err.message}`);
    }
  };

  // A retried request must not create a second contract. The spec names
  // messageId as the duplicate-detection key, so the same one means the same
  // request: ACK it again (the peer may have missed the first ACK) without
  // re-running the effect.
  const isReplay = (context) => {
    const key = `${context.action}:${context.messageId}`;
    if (seenMessageIds.has(key)) return true;
    seenMessageIds.add(key);
    return false;
  };

  const handle = (action, buildMessage) => [
    validateRequest(action),
    (req, res) => {
      const { context, message } = req.body;
      res.json(ack(context));
      if (isReplay(context)) return logger.info?.(`beckn pn: replayed ${action} ${context.messageId}, not re-run`);

      let result;
      try {
        result = buildMessage(message, context);
      } catch (err) {
        return logger.warn?.(`beckn pn: ${action} failed — ${err.message}`);
      }
      deliver(context, result);
    },
  ];

  app.post("/discover", ...handle("discover", (message, context) => {
    let matched;
    try {
      matched = matchResources(resources, message.intent);
    } catch (err) {
      if (err instanceof UnsupportedFilterError) {
        logger.warn?.(`beckn pn: ${err.message}`);
        return { catalogs: [] };
      }
      throw err;
    }
    if (!matched.length) return { catalogs: [] };

    return {
      catalogs: [
        {
          ...buildCatalog({ id: `${provider.id}-catalog`, provider, resources: matched, offers }),
          bppId: identity.subscriberId,
          bppUri: identity.uri,
        },
      ],
    };
  }));

  app.post("/select", ...handle("select", (message) => {
    const { chosenResources, chosenOffers } = resolveSelection(message.contract);
    return {
      contract: {
        commitments: commitmentsFrom(chosenResources, chosenOffers, "DRAFT"),
        consideration: considerationFor(chosenOffers),
        status: { code: "DRAFT" },
      },
    };
  }));

  app.post("/init", ...handle("init", (message) => {
    const { chosenResources, chosenOffers } = resolveSelection(message.contract);
    return {
      contract: {
        commitments: commitmentsFrom(chosenResources, chosenOffers, "DRAFT"),
        consideration: considerationFor(chosenOffers),
        participants: message.contract?.participants || [],
        performance: [{ id: "performance-1", status: { code: "PAYMENT_PENDING" }, commitmentIds: ["commitment-1"] }],
        status: { code: "DRAFT" },
      },
    };
  }));

  app.post("/confirm", ...handle("confirm", (message, context) => {
    const { chosenResources, chosenOffers } = resolveSelection(message.contract);

    // Contract.id is format:uuid in the schema, so it cannot be a readable
    // slug. Keyed by transactionId so a repeat confirm in the same journey
    // returns the contract that already exists.
    const existing = contracts.get(context.transactionId);
    const contract = existing || {
      id: crypto.randomUUID(),
      descriptor: { name: "Course enrolment" },
      commitments: commitmentsFrom(chosenResources, chosenOffers, "ACTIVE"),
      consideration: considerationFor(chosenOffers),
      participants: message.contract?.participants || [],
      performance: [{ id: "performance-1", status: { code: "ENROLLED" }, commitmentIds: ["commitment-1"] }],
      status: { code: "ACTIVE" },
    };
    contracts.set(context.transactionId, contract);
    return { contract };
  }));

  app.post("/status", ...handle("status", (message) => {
    const wanted = message.contract?.id;
    const contract = [...contracts.values()].find((candidate) => candidate.id === wanted);
    if (!contract) throw Object.assign(new Error(`unknown contract ${wanted}`), { code: ERROR_CODES.BIZ_ORDER_NOT_FOUND });
    return { contract };
  }));

  app.use((req, res) =>
    res.status(404).json(nackBadRequest(req.body?.context, `unsupported action at ${req.path}`, ERROR_CODES.NET_NOT_IMPLEMENTED))
  );

  app.locals.contracts = contracts;
  return app;
};
