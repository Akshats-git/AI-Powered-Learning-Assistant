// Starts a whole Beckn network on loopback: one registry, one consumer node,
// and one or more provider nodes, each on its own port and talking to the
// others over real HTTP with real signatures.
//
// Real sockets rather than in-process calls, because the things most likely to
// be wrong — signing the bytes that actually go on the wire, headers surviving
// the round trip, callbacks arriving on a separate connection — only fail over
// a real one. The test suite and `npm run beckn:demo` both start from here.

import { createRegistryApp } from "./registry/app.js";
import { createRegistryClient } from "./registry/client.js";
import { createBapApp } from "./bap/app.js";
import { createTransactionStore } from "./bap/transactions.js";
import { createBppApp } from "./bpp/app.js";
import { generateKeyPair } from "./core/keys.js";
import { CONSUMER_NODE, PROVIDER_NODE } from "./registry/store.js";

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` })
    );
  });

const close = (server) => new Promise((resolve) => server.close(resolve));

/**
 * @param providers descriptors for the provider nodes to start:
 *   [{ subscriberId, items, provider }]
 */
export const startNetwork = async ({
  providers = [{ subscriberId: "provider.learn.local" }],
  consumerSubscriberId = "app.learn.local",
  collectionWindowMs,
  logger = console,
  now = Date.now,
} = {}) => {
  const servers = [];

  const registryApp = createRegistryApp();
  const registryNode = await listen(registryApp);
  servers.push(registryNode.server);

  const registry = createRegistryClient({ baseUrl: registryNode.url, now });

  // A node has to be reachable before it can be registered (the record holds
  // its URL) but registered before it can be called (the peer needs its key),
  // so every node starts, then subscribes.
  const subscribe = async ({ subscriberId, url, type }) => {
    const { publicKey, privateKey } = generateKeyPair();
    const keyId = "key-1";
    await fetch(`${registryNode.url}/registry/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriberId, url, type, keyId, signingPublicKey: publicKey, countries: ["IND"] }),
    });
    return { subscriberId, keyId, privateKey, uri: url };
  };

  const providerNodes = [];
  for (const descriptor of providers) {
    const identity = { subscriberId: descriptor.subscriberId, keyId: "key-1" };
    const app = createBppApp({
      identity,
      lookupKey: registry.lookupKey,
      items: descriptor.items,
      provider: descriptor.provider,
      logger,
      now,
    });
    const node = await listen(app);
    servers.push(node.server);

    Object.assign(identity, await subscribe({ subscriberId: descriptor.subscriberId, url: node.url, type: PROVIDER_NODE }));
    providerNodes.push({ ...node, app, identity, subscriberId: descriptor.subscriberId });
  }

  const consumerIdentity = { subscriberId: consumerSubscriberId, keyId: "key-1" };
  const bapApp = createBapApp({
    identity: consumerIdentity,
    lookupKey: registry.lookupKey,
    registry,
    transactions: createTransactionStore({ collectionWindowMs, now }),
    logger,
    now,
  });
  const consumerNode = await listen(bapApp);
  servers.push(consumerNode.server);
  Object.assign(
    consumerIdentity,
    await subscribe({ subscriberId: consumerSubscriberId, url: consumerNode.url, type: CONSUMER_NODE })
  );

  return {
    registry: { ...registryNode, client: registry },
    consumer: { ...consumerNode, app: bapApp, identity: consumerIdentity },
    providers: providerNodes,
    stop: () => Promise.all(servers.map(close)),
  };
};
