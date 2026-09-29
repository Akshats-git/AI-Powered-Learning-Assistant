// The gateway (BG) — the broadcast point for discovery.
//
// Without one, a consumer node has to know every provider node and send each
// its own /discover, which means every CN re-implements fan-out and re-reads
// the registry. With one, the CN sends a single /discover to the gateway and
// the gateway multiplies it across the subnet.
//
// The gateway only ever touches discovery. Once a consumer knows which
// provider it wants, select/init/confirm/status go directly to that provider —
// so the gateway never sees the contract, the participants or the money, which
// is the privacy property that makes the topology worth having.
//
// Callbacks do not come back through here either: each provider node answers
// `context.bapUri` directly. The gateway is a fan-out, not a proxy.

import express from "express";
import { rawBodyJson, verifySignature, validateRequest } from "../core/middleware.js";
import { ack, nackBadRequest, ERROR_CODES } from "../core/ack.js";
import { postSigned } from "../core/client.js";

export const createGatewayApp = ({
  identity,
  lookupKey,
  registry,
  logger = console,
  fetchImpl = fetch,
  now = Date.now,
}) => {
  const app = express();
  app.use(rawBodyJson());
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use(verifySignature({ lookupKey, now, logger }));

  app.post("/discover", validateRequest("discover"), async (req, res) => {
    const { context, message } = req.body;
    res.json(ack(context));

    const providers = await registry.subscribers({ type: "PN" });
    if (!providers.length) return logger.warn?.("beckn gateway: no provider nodes subscribed");

    // The gateway re-signs with its own key: each provider verifies the
    // gateway, not the original consumer, which is the point of a broker. The
    // consumer's identity travels in the context (bapId/bapUri) so the
    // provider still knows where to call back.
    await Promise.allSettled(
      providers.map((provider) =>
        postSigned({
          url: `${provider.url}/discover`,
          payload: {
            context: { ...context, bppId: provider.subscriberId, bppUri: provider.url },
            message,
          },
          identity,
          fetchImpl,
          now,
        }).catch((err) => {
          logger.warn?.(`beckn gateway: broadcast to ${provider.subscriberId} failed — ${err.message}`);
          throw err;
        })
      )
    );
  });

  app.use((req, res) =>
    res
      .status(404)
      .json(nackBadRequest(req.body?.context, "a gateway only accepts /discover", ERROR_CODES.NET_NOT_IMPLEMENTED))
  );

  return app;
};
