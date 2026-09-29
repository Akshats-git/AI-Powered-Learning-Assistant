// A minimal DeDi-style registry: publish a subscriber record, look one up.
//
// Registry reads are deliberately unsigned. A node that has not yet fetched a
// peer's public key cannot verify that peer's signature, so requiring one here
// would be circular — this is the trust anchor, and it is trusted because of
// where it is (a DNS-verified namespace), not because of a signature on the
// response.
//
// On the lookup path shape: NFH-007 documents
//   /registry/dedi/lookup/{subscriberId}/keys/{keyId}|ed25519
// while docs.nfh.global and current ONIX implementations use
//   /registry/dedi/lookup/{subscriberId}/subscribers.beckn.one/{recordId}
// Both are served here. That divergence is open upstream as
// beckn/protocol-specifications-v2#196; see docs/beckn.md.

import express from "express";
import { createSubscriberStore } from "./store.js";

export const createRegistryApp = ({ store = createSubscriberStore() } = {}) => {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/registry/subscribe", (req, res) => {
    const { subscriberId, url, type, signingPublicKey, keyId } = req.body || {};
    if (!subscriberId || !url || !type || !signingPublicKey || !keyId) {
      return res.status(400).json({ error: "subscriberId, url, type, signingPublicKey and keyId are required" });
    }
    const recordId = store.put(req.body);
    res.status(201).json({ recordId, status: "SUBSCRIBED" });
  });

  // The docs.nfh.global / ONIX form.
  app.get("/registry/dedi/lookup/:subscriberId/subscribers.beckn.one/:recordId", (req, res) => {
    const [, keyId] = req.params.recordId.split(":");
    const record = store.get(req.params.subscriberId, keyId);
    if (!record) return res.status(404).json({ error: "subscriber record not found" });
    res.json(record);
  });

  // The NFH-007 form, where the key id carries an `|ed25519` algorithm suffix.
  app.get("/registry/dedi/lookup/:subscriberId/keys/:keyId", (req, res) => {
    const record = store.get(req.params.subscriberId, req.params.keyId.split("|")[0]);
    if (!record) return res.status(404).json({ error: "subscriber record not found" });
    res.json(record);
  });

  app.get("/registry/subscribers", (req, res) => {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.domain) filter.domain = req.query.domain;
    res.json({ subscribers: store.list(filter) });
  });

  app.locals.store = store;
  return app;
};
