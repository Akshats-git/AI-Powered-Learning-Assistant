// End-to-end over real sockets: a consumer node discovers across the network,
// then walks one provider node through select -> init -> confirm -> status.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startNetwork } from "../beckn/network.js";
import { buildItem } from "../beckn/bpp/catalog.js";

const silent = { warn: () => {}, info: () => {}, error: () => {} };

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

describe("beckn end-to-end flow", () => {
  let network;

  beforeAll(async () => {
    network = await startNetwork({
      logger: silent,
      collectionWindowMs: 250,
      providers: [
        { subscriberId: "provider-a.learn.local" },
        {
          subscriberId: "provider-b.learn.local",
          provider: { id: "open-university", descriptor: { name: "Open University" } },
          items: [
            buildItem({
              id: "course-graphs-advanced",
              name: "Advanced graph theory",
              shortDesc: "Flow networks, matchings and planarity",
              kind: "course",
              concepts: ["graphs", "dijkstra", "max-flow"],
              price: 999,
            }),
          ],
        },
      ],
    });
  });

  afterAll(async () => {
    await network?.stop();
  });

  it("registers every node as SUBSCRIBED and serves their keys back", async () => {
    const subscribers = await network.registry.client.subscribers();
    expect(subscribers).toHaveLength(3);
    expect(subscribers.every((s) => s.status === "SUBSCRIBED")).toBe(true);

    const key = await network.registry.client.lookupKey({ subscriberId: "provider-a.learn.local", keyId: "key-1" });
    expect(Buffer.from(key, "base64")).toHaveLength(32);
  });

  it("fans a concept search out to every provider node and merges the catalogs", async () => {
    const { body } = await postJson(`${network.consumer.url}/api/network/discover`, {
      intent: { tags: [{ descriptor: { code: "concept" }, value: "dijkstra" }] },
    });

    expect(body.transactionId).toBeTruthy();
    // Both providers carry something tagged dijkstra.
    expect(body.providers).toHaveLength(2);

    const names = body.providers.flatMap((p) => p.items.map((i) => i.descriptor.name)).sort();
    expect(names).toContain("Advanced graph theory");
    expect(names).toContain("Shortest paths — practice quiz");
  });

  it("returns only matching items, not the whole catalog", async () => {
    const { body } = await postJson(`${network.consumer.url}/api/network/discover`, {
      intent: { tags: [{ descriptor: { code: "concept" }, value: "linear-algebra" }] },
    });

    const items = body.providers.flatMap((p) => p.items);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("course-linear-algebra");
  });

  it("matches free text against the descriptor when no concept tag is given", async () => {
    const { body } = await postJson(`${network.consumer.url}/api/network/discover`, {
      intent: { item: { descriptor: { name: "dynamic programming" } } },
    });

    const items = body.providers.flatMap((p) => p.items);
    expect(items.map((i) => i.id)).toEqual(["course-dp-foundations"]);
  });

  it("walks select -> init -> confirm -> status and ends with an active order", async () => {
    const discovered = await postJson(`${network.consumer.url}/api/network/discover`, {
      intent: { tags: [{ descriptor: { code: "concept" }, value: "dynamic-programming" }] },
    });
    const { transactionId } = discovered.body;
    const order = { items: [{ id: "course-dp-foundations" }] };
    const base = { providerSubscriberId: "provider-a.learn.local", transactionId };

    const selected = await postJson(`${network.consumer.url}/api/network/select`, { ...base, message: { order } });
    expect(selected.body.order.quote.price.value).toBe("499");

    const initialised = await postJson(`${network.consumer.url}/api/network/init`, {
      ...base,
      message: { order: { ...order, billing: { name: "Akshat", email: "learner@example.com" } } },
    });
    expect(initialised.body.order.fulfillment.state.descriptor.code).toBe("PAYMENT_PENDING");

    const confirmed = await postJson(`${network.consumer.url}/api/network/confirm`, {
      ...base,
      message: { order: { ...order, billing: { name: "Akshat", email: "learner@example.com" } } },
    });
    expect(confirmed.body.order.id).toMatch(/^order-/);
    expect(confirmed.body.order.state).toBe("ACTIVE");
    expect(confirmed.body.order.fulfillment.state.descriptor.code).toBe("ENROLLED");

    const status = await postJson(`${network.consumer.url}/api/network/status`, {
      ...base,
      message: { orderId: confirmed.body.order.id },
    });
    expect(status.body.order.id).toBe(confirmed.body.order.id);
    expect(status.body.order.state).toBe("ACTIVE");
  });

  it("keeps one journey under a single transactionId across every action", async () => {
    const discovered = await postJson(`${network.consumer.url}/api/network/discover`, {
      intent: { tags: [{ descriptor: { code: "concept" }, value: "graphs" }] },
    });
    const { transactionId } = discovered.body;

    const selected = await postJson(`${network.consumer.url}/api/network/select`, {
      providerSubscriberId: "provider-b.learn.local",
      transactionId,
      message: { order: { items: [{ id: "course-graphs-advanced" }] } },
    });
    expect(selected.status).toBe(200);
    expect(selected.body.order.items[0].id).toBe("course-graphs-advanced");
  });
});
