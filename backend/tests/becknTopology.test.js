// Network topology and key lifecycle: broadcast discovery through a gateway,
// and rotating a participant's signing key without dropping traffic.

import { describe, it, expect, afterEach } from "vitest";
import { startNetwork } from "../beckn/network.js";
import { generateKeyPair } from "../beckn/core/keys.js";
import { sign } from "../beckn/core/signing.js";
import { buildContext } from "../beckn/core/context.js";
import { conceptFilter } from "../beckn/bpp/catalog.js";

const silent = { warn: () => {}, info: () => {}, error: () => {} };

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
};

describe("beckn network topology", () => {
  let network;

  afterEach(async () => {
    await network?.stop();
    network = null;
  });

  it("broadcasts one /discover through the gateway to every provider node", async () => {
    network = await startNetwork({
      logger: silent,
      withGateway: true,
      collectionWindowMs: 400,
      providers: [{ subscriberId: "provider-a.learn.local" }, { subscriberId: "provider-b.learn.local" }],
    });

    expect(network.gateway).toBeTruthy();

    const result = await postJson(`${network.consumer.url}/api/network/discover`, {
      intent: { filters: conceptFilter("dijkstra") },
    });

    // The consumer sent one request; both providers answered it, against the
    // same messageId, and both catalogs arrived inside the window.
    expect(result.catalogs).toHaveLength(2);
    expect(new Set(result.catalogs.map((c) => c.bppId))).toEqual(
      new Set(["provider-a.learn.local", "provider-b.learn.local"])
    );
  });

  it("reaches the same providers without a gateway, by fanning out from the registry", async () => {
    network = await startNetwork({
      logger: silent,
      collectionWindowMs: 400,
      providers: [{ subscriberId: "provider-a.learn.local" }, { subscriberId: "provider-b.learn.local" }],
    });

    expect(network.gateway).toBeNull();

    const result = await postJson(`${network.consumer.url}/api/network/discover`, {
      intent: { filters: conceptFilter("dijkstra") },
    });
    expect(result.catalogs).toHaveLength(2);
  });

  it("only broadcasts discovery — a gateway refuses contracting actions", async () => {
    network = await startNetwork({ logger: silent, withGateway: true, collectionWindowMs: 200 });

    const context = buildContext({
      action: "select",
      networkId: "beckn.local",
      consumer: { id: network.consumer.identity.subscriberId, uri: network.consumer.url },
      provider: { id: network.gateway.subscriberId, uri: network.gateway.url },
    });
    const body = JSON.stringify({ context, message: { contract: { commitments: [] } } });

    const response = await fetch(`${network.gateway.url}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sign({ body, ...network.consumer.identity }) },
      body,
    });

    expect(response.status).toBe(404);
    expect((await response.json()).message.error.code).toBe("NET_NOT_IMPLEMENTED");
  });
});

describe("beckn key rotation", () => {
  let network;

  afterEach(async () => {
    await network?.stop();
    network = null;
  });

  const publishKey = (registryUrl, record) =>
    postJson(`${registryUrl}/registry/subscribe`, { countries: ["IND"], ...record });

  it("serves both keys while a participant is rotating", async () => {
    network = await startNetwork({ logger: silent, collectionWindowMs: 200 });
    const { subscriberId } = network.consumer.identity;
    const rotated = generateKeyPair();

    await publishKey(network.registry.url, {
      subscriberId,
      url: network.consumer.url,
      type: "CN",
      keyId: "key-2",
      signingPublicKey: rotated.publicKey,
    });

    const listed = await (await fetch(`${network.registry.url}/registry/keys/${subscriberId}`)).json();
    expect(listed.keys.map((k) => k.keyId).sort()).toEqual(["key-1", "key-2"]);

    // Both the outgoing and the incoming key verify while rotation is in
    // progress — messages already in flight must not start failing.
    for (const keyId of ["key-1", "key-2"]) {
      expect(await network.registry.client.lookupKey({ subscriberId, keyId })).toBeTruthy();
    }
  });

  it("stops verifying a revoked key but leaves the participant's others working", async () => {
    network = await startNetwork({ logger: silent, collectionWindowMs: 200 });
    const { subscriberId } = network.consumer.identity;
    const rotated = generateKeyPair();

    await publishKey(network.registry.url, {
      subscriberId,
      url: network.consumer.url,
      type: "CN",
      keyId: "key-2",
      signingPublicKey: rotated.publicKey,
    });
    await postJson(`${network.registry.url}/registry/revoke`, { subscriberId, keyId: "key-1" });

    network.registry.client.clearCache();
    expect(await network.registry.client.lookupKey({ subscriberId, keyId: "key-1" })).toBeNull();
    expect(await network.registry.client.lookupKey({ subscriberId, keyId: "key-2" })).toBe(rotated.publicKey);
  });

  it("refuses a request signed with a revoked key", async () => {
    network = await startNetwork({ logger: silent, collectionWindowMs: 200 });
    const [provider] = network.providers;
    const { subscriberId } = network.consumer.identity;

    await postJson(`${network.registry.url}/registry/revoke`, { subscriberId, keyId: "key-1" });

    const context = buildContext({
      action: "discover",
      networkId: "beckn.local",
      consumer: { id: subscriberId, uri: network.consumer.url },
      provider: { id: provider.subscriberId, uri: provider.url },
    });
    const body = JSON.stringify({ context, message: { intent: { textSearch: "graphs" } } });

    const response = await fetch(`${provider.url}/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: sign({ body, ...network.consumer.identity }) },
      body,
    });

    expect(response.status).toBe(401);
    expect((await response.json()).message.error.code).toBe("AUT_SUBSCRIBER_NOT_FOUND");
  });
});
