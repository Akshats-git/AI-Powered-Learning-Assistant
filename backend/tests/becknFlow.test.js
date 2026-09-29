// End-to-end over real sockets: a consumer node discovers across the subnet,
// then walks one provider node through select -> init -> confirm -> status.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startNetwork } from "../beckn/network.js";
import { buildResource, buildOffer, conceptFilter, priceOf } from "../beckn/bpp/catalog.js";
import { validateComponent } from "../beckn/core/validate.js";

const silent = { warn: () => {}, info: () => {}, error: () => {} };

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const commitmentFor = (resourceId, offerId) => ({
  status: { descriptor: { code: "DRAFT" } },
  resources: [{ id: resourceId, quantity: 1 }],
  offer: { id: offerId, resourceIds: [resourceId] },
});

describe("beckn end-to-end flow", () => {
  let network;
  let discoverUrl;

  const discover = (intent) => postJson(discoverUrl, { intent });

  beforeAll(async () => {
    network = await startNetwork({
      logger: silent,
      collectionWindowMs: 250,
      providers: [
        { subscriberId: "provider-a.learn.local" },
        {
          subscriberId: "provider-b.learn.local",
          provider: { id: "open-university", descriptor: { name: "Open University" } },
          resources: [
            buildResource({
              id: "course-graphs-advanced",
              name: "Advanced graph theory",
              shortDesc: "Flow networks, matchings and planarity",
              kind: "course",
              concepts: ["graphs", "dijkstra", "max-flow"],
              level: "advanced",
              durationMinutes: 300,
            }),
          ],
          offers: [
            buildOffer({
              id: "offer-graphs-advanced",
              resourceIds: ["course-graphs-advanced"],
              name: "Course enrolment",
              value: 999,
            }),
          ],
        },
      ],
    });
    discoverUrl = `${network.consumer.url}/api/network/discover`;
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

  it("fans a concept filter out to every provider node and merges the catalogs", async () => {
    const { body } = await discover({ filters: conceptFilter("dijkstra") });

    expect(body.transactionId).toBeTruthy();
    expect(body.catalogs).toHaveLength(2);

    const names = body.catalogs.flatMap((c) => c.resources.map((r) => r.descriptor.name)).sort();
    expect(names).toContain("Advanced graph theory");
    expect(names).toContain("Shortest paths — practice quiz");
  });

  it("returns catalogs that validate against the pinned Catalog schema", async () => {
    const { body } = await discover({ filters: conceptFilter("dijkstra") });

    for (const catalog of body.catalogs) {
      expect(validateComponent("Catalog", catalog)).toEqual({ valid: true, errors: "" });
    }
  });

  it("carries only the offers covering the resources that matched", async () => {
    const { body } = await discover({ filters: conceptFilter("linear-algebra") });

    const [catalog] = body.catalogs;
    expect(catalog.resources.map((r) => r.id)).toEqual(["course-linear-algebra"]);
    expect(catalog.offers.map((o) => o.id)).toEqual(["offer-course-linear-algebra"]);
    expect(priceOf(catalog.offers[0])).toEqual({ currency: "INR", value: 799 });
  });

  it("matches free text against descriptors and concepts", async () => {
    const { body } = await discover({ textSearch: "dynamic programming" });

    const resources = body.catalogs.flatMap((c) => c.resources);
    expect(resources.map((r) => r.id)).toEqual(["course-dp-foundations"]);
  });

  it("returns no catalogs rather than failing when nothing matches", async () => {
    const { body } = await discover({ filters: conceptFilter("quantum-chromodynamics") });
    expect(body.catalogs).toEqual([]);
  });

  it("walks select -> init -> confirm -> status and ends with an active contract", async () => {
    const { body: discovered } = await discover({ filters: conceptFilter("dynamic-programming") });
    const { transactionId } = discovered;
    const base = { providerSubscriberId: "provider-a.learn.local", transactionId };
    const commitments = [commitmentFor("course-dp-foundations", "offer-course-dp-foundations")];
    const participants = [{ id: "learner-1", descriptor: { name: "Akshat" } }];

    const selected = await postJson(`${network.consumer.url}/api/network/select`, {
      ...base,
      message: { contract: { commitments } },
    });
    expect(selected.body.contract.consideration[0].considerationAttributes.price).toBe("499");
    expect(selected.body.contract.status.code).toBe("DRAFT");

    const initialised = await postJson(`${network.consumer.url}/api/network/init`, {
      ...base,
      message: { contract: { commitments, participants } },
    });
    expect(initialised.body.contract.performance[0].status.code).toBe("PAYMENT_PENDING");

    const confirmed = await postJson(`${network.consumer.url}/api/network/confirm`, {
      ...base,
      message: { contract: { commitments, participants } },
    });
    const { contract } = confirmed.body;
    expect(contract.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(contract.status.code).toBe("ACTIVE");
    expect(contract.performance[0].status.code).toBe("ENROLLED");
    expect(validateComponent("Contract", contract)).toEqual({ valid: true, errors: "" });

    const status = await postJson(`${network.consumer.url}/api/network/status`, {
      ...base,
      message: { contract: { id: contract.id, commitments: contract.commitments } },
    });
    expect(status.body.contract.id).toBe(contract.id);
    expect(status.body.contract.status.code).toBe("ACTIVE");
  });

  it("keeps one journey under a single transactionId across providers", async () => {
    const { body: discovered } = await discover({ filters: conceptFilter("graphs") });

    const selected = await postJson(`${network.consumer.url}/api/network/select`, {
      providerSubscriberId: "provider-b.learn.local",
      transactionId: discovered.transactionId,
      message: { contract: { commitments: [commitmentFor("course-graphs-advanced", "offer-graphs-advanced")] } },
    });

    expect(selected.status).toBe(200);
    expect(selected.body.contract.consideration[0].considerationAttributes.price).toBe("999");
  });
});
