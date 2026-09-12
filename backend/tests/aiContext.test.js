import { describe, it, expect, afterEach } from "vitest";
import { runWithApiKey, getActiveApiKey, getActiveKeySource, hasActiveApiKey } from "../utils/aiContext.js";

const ORIGINAL_ENV_KEY = process.env.OPENAI_API_KEY;

describe("aiContext", () => {
  afterEach(() => {
    if (ORIGINAL_ENV_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_ENV_KEY;
  });

  it("falls back to process.env.OPENAI_API_KEY outside any request context", () => {
    process.env.OPENAI_API_KEY = "sk-env-fallback";
    expect(getActiveApiKey()).toBe("sk-env-fallback");
    expect(getActiveKeySource()).toBe("shared");
    expect(hasActiveApiKey()).toBe(true);
  });

  it("returns null when nothing is configured anywhere", () => {
    delete process.env.OPENAI_API_KEY;
    expect(getActiveApiKey()).toBeNull();
    expect(getActiveKeySource()).toBeNull();
    expect(hasActiveApiKey()).toBe(false);
  });

  it("exposes the store's key and source within runWithApiKey", async () => {
    await runWithApiKey({ apiKey: "sk-users-own-key", keySource: "own" }, async () => {
      expect(getActiveApiKey()).toBe("sk-users-own-key");
      expect(getActiveKeySource()).toBe("own");
    });
  });

  it("keeps context across an await boundary inside the callback", async () => {
    await runWithApiKey({ apiKey: "sk-async-key", keySource: "own" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getActiveApiKey()).toBe("sk-async-key");
    });
  });

  it("does not leak one context into a sibling context", async () => {
    const results = await Promise.all([
      runWithApiKey({ apiKey: "sk-key-a", keySource: "own" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getActiveApiKey();
      }),
      runWithApiKey({ apiKey: "sk-key-b", keySource: "shared" }, async () => {
        return getActiveApiKey();
      }),
    ]);

    expect(results).toEqual(["sk-key-a", "sk-key-b"]);
  });

  it("falls back to the shared env key inside a context that has no key of its own", () => {
    process.env.OPENAI_API_KEY = "sk-env-fallback";
    runWithApiKey({ apiKey: null, keySource: null }, () => {
      expect(getActiveApiKey()).toBe("sk-env-fallback");
    });
  });
});
