// The app-facing network API: auth, graceful degradation when this deployment
// is not on a subnet, and weak-concept suggestions from the mastery model.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app.js";
import Mastery from "../models/Mastery.js";
import { createUserWithToken } from "./helpers.js";
import { resetBecknNode, isBecknConfigured, becknConfig } from "../utils/becknNode.js";

const BECKN_VARS = [
  "BECKN_SUBSCRIBER_ID",
  "BECKN_PRIVATE_KEY",
  "BECKN_CALLBACK_URL",
  "BECKN_REGISTRY_URL",
  "BECKN_GATEWAY_ID",
  "BECKN_GATEWAY_URL",
];

describe("network API", () => {
  let saved;

  beforeEach(() => {
    saved = Object.fromEntries(BECKN_VARS.map((key) => [key, process.env[key]]));
    for (const key of BECKN_VARS) delete process.env[key];
    resetBecknNode();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetBecknNode();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/network/status")).status).toBe(401);
    expect((await request(app).post("/api/network/discover").send({ concept: "graphs" })).status).toBe(401);
  });

  it("reports itself unconfigured when no subscriber is set", async () => {
    const { token } = await createUserWithToken();
    const res = await request(app).get("/api/network/status").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it("answers discovery with 503 and an explanation rather than crashing", async () => {
    const { token } = await createUserWithToken();
    const res = await request(app)
      .post("/api/network/discover")
      .set("Authorization", `Bearer ${token}`)
      .send({ concept: "dijkstra" });

    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not on a Beckn subnet/i);
  });

  it("rejects a discovery with neither a concept nor search text", async () => {
    process.env.BECKN_SUBSCRIBER_ID = "learn.test";
    process.env.BECKN_PRIVATE_KEY = Buffer.alloc(32).toString("base64");
    process.env.BECKN_CALLBACK_URL = "http://127.0.0.1:1/beckn";
    process.env.BECKN_REGISTRY_URL = "http://127.0.0.1:1";
    resetBecknNode();

    const { token } = await createUserWithToken();
    const res = await request(app).post("/api/network/discover").set("Authorization", `Bearer ${token}`).send({});

    expect(res.status).toBe(400);
  });

  it("reads configuration from the environment, gateway included", () => {
    expect(isBecknConfigured({})).toBe(false);

    const env = {
      BECKN_SUBSCRIBER_ID: "learn.test",
      BECKN_PRIVATE_KEY: "k",
      BECKN_CALLBACK_URL: "http://callback",
      BECKN_REGISTRY_URL: "http://registry",
      BECKN_GATEWAY_URL: "http://gateway",
      BECKN_GATEWAY_ID: "gateway.test",
    };
    expect(isBecknConfigured(env)).toBe(true);
    expect(becknConfig(env)).toMatchObject({
      subscriberId: "learn.test",
      keyId: "key-1",
      gatewayId: "gateway.test",
      networkId: "beckn.local",
    });
  });
});

describe("network suggestions", () => {
  it("returns the learner's weakest concepts, worst first", async () => {
    const { user, token } = await createUserWithToken();
    const document = new mongoose.Types.ObjectId();

    await Mastery.create([
      { user: user._id, document, concept: "dijkstra", pKnown: 0.2, opportunities: 4 },
      { user: user._id, document, concept: "recursion", pKnown: 0.4, opportunities: 3 },
      { user: user._id, document, concept: "sorting", pKnown: 0.98, opportunities: 9 },
    ]);

    const res = await request(app).get("/api/network/suggestions").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Mastered concepts are not suggestions — there is nothing to go and learn.
    expect(res.body.concepts.map((c) => c.concept)).toEqual(["dijkstra", "recursion"]);
  });

  it("deduplicates a concept the learner meets in several documents", async () => {
    const { user, token } = await createUserWithToken();

    await Mastery.create([
      { user: user._id, document: new mongoose.Types.ObjectId(), concept: "graphs", pKnown: 0.15, opportunities: 2 },
      { user: user._id, document: new mongoose.Types.ObjectId(), concept: "graphs", pKnown: 0.35, opportunities: 5 },
    ]);

    const res = await request(app).get("/api/network/suggestions").set("Authorization", `Bearer ${token}`);
    expect(res.body.concepts).toHaveLength(1);
    expect(res.body.concepts[0]).toMatchObject({ concept: "graphs", pKnown: 0.15 });
  });

  it("returns nothing for a learner with no quiz history yet", async () => {
    const { token } = await createUserWithToken();
    const res = await request(app).get("/api/network/suggestions").set("Authorization", `Bearer ${token}`);
    expect(res.body.concepts).toEqual([]);
  });
});
