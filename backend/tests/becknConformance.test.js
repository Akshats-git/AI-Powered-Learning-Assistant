// Protocol conformance: the cases a node must get right that a happy-path
// demo never exercises. Every request below goes over a real socket to a real
// provider node, signed (or deliberately mis-signed) exactly as a peer would.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startNetwork } from "../beckn/network.js";
import { sign } from "../beckn/core/signing.js";
import { buildContext } from "../beckn/core/context.js";
import { generateKeyPair } from "../beckn/core/keys.js";

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
      domain: "education",
      networkId: "beckn.local",
      senderId: network.consumer.identity.subscriberId,
      senderUri: network.consumer.url,
      receiverId: provider.subscriberId,
      receiverUri: provider.url,
    }),
    ...overrides,
  });

  beforeAll(async () => {
    network = await startNetwork({ logger: silent, collectionWindowMs: 250 });
    [provider] = network.providers;
  });

  afterAll(async () => {
    await network?.stop();
  });

  describe("authentication (NFH-007)", () => {
    it("ACKs a correctly signed request", async () => {
      const { status, body } = await post("/discover", { context: contextFor("discover"), message: { intent: {} } });
      expect(status).toBe(200);
      expect(body.message.ack.status).toBe("ACK");
    });

    it("rejects an unsigned request with 401 NackUnauthorized", async () => {
      const { status, body } = await post(
        "/discover",
        { context: contextFor("discover"), message: { intent: {} } },
        { authorization: null }
      );
      expect(status).toBe(401);
      expect(body.message.ack.status).toBe("NACK");
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a body altered after signing", async () => {
      const signed = JSON.stringify({ context: contextFor("discover"), message: { intent: {} } });
      const authorization = sign({ body: signed, ...network.consumer.identity });
      const tampered = JSON.stringify({ context: contextFor("discover"), message: { intent: { hacked: true } } });

      const { status, body } = await post("/discover", null, { authorization, rawBody: tampered });
      expect(status).toBe(401);
      expect(body.error.message).toMatch(/verification failed/);
    });

    it("rejects a signature from a subscriber the registry has never seen", async () => {
      const stranger = generateKeyPair();
      const payload = { context: contextFor("discover"), message: { intent: {} } };
      const body = JSON.stringify(payload);
      const authorization = sign({
        body,
        subscriberId: "stranger.example.com",
        keyId: "key-1",
        privateKey: stranger.privateKey,
      });

      const { status, body: response } = await post("/discover", null, { authorization, rawBody: body });
      expect(status).toBe(401);
      expect(response.error.message).toMatch(/unknown subscriber/);
    });

    it("rejects a signature carrying another scheme's Authorization header", async () => {
      const { status } = await post(
        "/discover",
        { context: contextFor("discover"), message: { intent: {} } },
        { authorization: "Bearer not-a-beckn-signature" }
      );
      expect(status).toBe(401);
    });
  });

  describe("request validation", () => {
    it("rejects a payload with no context as 400 NackBadRequest", async () => {
      const { status, body } = await post("/discover", { message: { intent: {} } });
      expect(status).toBe(400);
      expect(body.message.ack.status).toBe("NACK");
      expect(body.error.code).toBe("BAD_REQUEST");
    });

    it("names the missing context fields rather than failing opaquely", async () => {
      const context = contextFor("discover");
      delete context.transactionId;
      delete context.messageId;

      const { status, body } = await post("/discover", { context, message: { intent: {} } });
      expect(status).toBe(400);
      expect(body.error.message).toContain("transactionId");
      expect(body.error.message).toContain("messageId");
    });

    it("rejects a context.action that disagrees with the endpoint it arrived on", async () => {
      const { status, body } = await post("/discover", {
        context: contextFor("select"),
        message: { intent: {} },
      });
      expect(status).toBe(400);
      expect(body.error.message).toMatch(/must be "discover"/);
    });

    it("rejects an unsupported action with a NACK, not an HTML 404", async () => {
      const { status, body } = await post("/rate", { context: contextFor("rate"), message: {} });
      expect(status).toBe(404);
      expect(body.message.ack.status).toBe("NACK");
    });
  });

  describe("idempotency", () => {
    it("treats a replayed messageId as the same request and does not act twice", async () => {
      const transactionId = crypto.randomUUID();
      const payload = {
        context: contextFor("confirm", { transactionId, messageId: crypto.randomUUID() }),
        message: { order: { items: [{ id: "course-dp-foundations" }] } },
      };

      const first = await post("/confirm", payload);
      const second = await post("/confirm", payload);

      // Both are ACKed — the peer may simply have missed the first ACK —
      // but only one order exists afterwards.
      expect(first.body.message.ack.status).toBe("ACK");
      expect(second.body.message.ack.status).toBe("ACK");

      await new Promise((resolve) => setTimeout(resolve, 100));
      const orders = [...provider.app.locals.orders.values()].filter((o) => o.id === `order-${transactionId.slice(0, 8)}`);
      expect(orders).toHaveLength(1);
    });
  });
});
