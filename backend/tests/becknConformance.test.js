// Protocol conformance: the cases a node must get right that a happy path
// never exercises. Every request goes over a real socket to a real provider
// node, signed or deliberately mis-signed exactly as a peer would.
//
// Responses are themselves validated against the pinned schemas — a node that
// rejects correctly but answers with a malformed rejection is still wrong.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startNetwork } from "../beckn/network.js";
import { sign } from "../beckn/core/signing.js";
import { buildContext } from "../beckn/core/context.js";
import { generateKeyPair } from "../beckn/core/keys.js";
import { validateComponent } from "../beckn/core/validate.js";
import { conceptFilter } from "../beckn/bpp/catalog.js";

const silent = { warn: () => {}, info: () => {}, error: () => {} };

describe("beckn protocol conformance", () => {
  let network;
  let provider;

  const post = async (path, payload, { authorization, rawBody } = {}) => {
    const body = rawBody ?? JSON.stringify(payload);
    const headers = { "Content-Type": "application/json" };
    if (authorization !== null) {
      headers.Authorization = authorization ?? sign({ body, ...network.consumer.identity });
    }
    const response = await fetch(`${provider.url}${path}`, { method: "POST", headers, body });
    return { status: response.status, body: await response.json() };
  };

  const contextFor = (action, overrides = {}) => ({
    ...buildContext({
      action,
      networkId: "beckn.local",
      consumer: { id: network.consumer.identity.subscriberId, uri: network.consumer.url },
      provider: { id: provider.subscriberId, uri: provider.url },
    }),
    ...overrides,
  });

  const discoverPayload = (overrides = {}) => ({
    context: contextFor("discover", overrides.context),
    message: { intent: { filters: conceptFilter("dijkstra") } },
    ...overrides.body,
  });

  beforeAll(async () => {
    network = await startNetwork({ logger: silent, collectionWindowMs: 250 });
    [provider] = network.providers;
  });

  afterAll(async () => {
    await network?.stop();
  });

  describe("authentication (NFH-007)", () => {
    it("ACKs a correctly signed request, in the schema's Ack shape", async () => {
      const { status, body } = await post("/discover", discoverPayload());

      expect(status).toBe(200);
      expect(body.message.status).toBe("ACK");
      expect(validateComponent("Ack", body)).toEqual({ valid: true, errors: "" });
    });

    it("rejects an unsigned request with 401 and AUT_SIGNATURE_MISSING", async () => {
      const { status, body } = await post("/discover", discoverPayload(), { authorization: null });

      expect(status).toBe(401);
      expect(body.message.status).toBe("NACK");
      expect(body.message.error.code).toBe("AUT_SIGNATURE_MISSING");
      expect(validateComponent("NackUnauthorized", body)).toEqual({ valid: true, errors: "" });
    });

    it("rejects a body altered after signing", async () => {
      const signed = JSON.stringify(discoverPayload());
      const authorization = sign({ body: signed, ...network.consumer.identity });
      const tampered = JSON.stringify(discoverPayload({ body: { extra: "injected" } }));

      const { status, body } = await post("/discover", null, { authorization, rawBody: tampered });
      expect(status).toBe(401);
      expect(body.message.error.code).toBe("AUT_SIGNATURE_INVALID");
    });

    it("rejects a signature from a subscriber the registry has never seen", async () => {
      const stranger = generateKeyPair();
      const body = JSON.stringify(discoverPayload());
      const authorization = sign({
        body,
        subscriberId: "stranger.example.com",
        keyId: "key-1",
        privateKey: stranger.privateKey,
      });

      const { status, body: response } = await post("/discover", null, { authorization, rawBody: body });
      expect(status).toBe(401);
      expect(response.message.error.code).toBe("AUT_SUBSCRIBER_NOT_FOUND");
    });

    it("rejects another authorization scheme entirely", async () => {
      const { status } = await post("/discover", discoverPayload(), { authorization: "Bearer not-a-beckn-signature" });
      expect(status).toBe(401);
    });
  });

  describe("schema validation against the pinned spec", () => {
    it("rejects a payload with no context", async () => {
      const { status, body } = await post("/discover", { message: { intent: {} } });

      expect(status).toBe(400);
      expect(body.message.error.code).toBe("CTX_MISSING_FIELD");
      expect(validateComponent("NackBadRequest", body)).toEqual({ valid: true, errors: "" });
    });

    it("rejects a context.action that disagrees with the endpoint", async () => {
      const { status, body } = await post("/discover", discoverPayload({ context: { action: "select" } }));

      expect(status).toBe(400);
      expect(body.message.error.code).toBe("CTX_ACTION_MISMATCH");
    });

    it("rejects an unsupported protocol version", async () => {
      const { status, body } = await post("/discover", discoverPayload({ context: { version: "1.1.0" } }));

      expect(status).toBe(400);
      expect(body.message.error.code).toBe("CTX_VERSION_UNSUPPORTED");
    });

    it("rejects a context field of the wrong type", async () => {
      const { status, body } = await post("/discover", discoverPayload({ context: { ttl: 30 } }));

      expect(status).toBe(400);
      expect(body.message.error.code).toBe("SCH_SCHEMA_VALIDATION_FAILED");
      expect(body.message.error.message).toContain("ttl");
    });

    it("rejects a v1-shaped intent, which the v2 Intent schema forbids", async () => {
      const { status, body } = await post("/discover", {
        context: contextFor("discover"),
        message: { intent: { item: { descriptor: { name: "dijkstra" } } } },
      });

      expect(status).toBe(400);
      expect(body.message.error.code).toBe("SCH_SCHEMA_VALIDATION_FAILED");
    });

    it("rejects a select whose contract has no commitments", async () => {
      const { status, body } = await post("/select", {
        context: contextFor("select"),
        message: { contract: {} },
      });

      expect(status).toBe(400);
      expect(body.message.error.message).toContain("commitments");
    });

    it("rejects an unsupported action with a NACK, not an HTML 404", async () => {
      const { status, body } = await post("/rate", { context: contextFor("rate"), message: {} });

      expect(status).toBe(404);
      expect(body.message.status).toBe("NACK");
      expect(body.message.error.code).toBe("NET_NOT_IMPLEMENTED");
    });
  });

  describe("idempotency", () => {
    it("treats a replayed messageId as the same request and does not act twice", async () => {
      const context = contextFor("confirm");
      const payload = {
        context,
        message: {
          contract: {
            commitments: [
              {
                status: { descriptor: { code: "DRAFT" } },
                resources: [{ id: "course-dp-foundations", quantity: 1 }],
                offer: { id: "offer-course-dp-foundations", resourceIds: ["course-dp-foundations"] },
              },
            ],
          },
        },
      };

      const first = await post("/confirm", payload);
      const second = await post("/confirm", payload);

      // Both are ACKed — the peer may simply have missed the first ACK — but
      // only one contract exists afterwards.
      expect(first.body.message.status).toBe("ACK");
      expect(second.body.message.status).toBe("ACK");

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(provider.app.locals.contracts.get(context.transactionId)).toBeTruthy();
      expect(provider.app.locals.contracts.size).toBe(1);
    });
  });
});
