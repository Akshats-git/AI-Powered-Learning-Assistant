import { describe, it, expect } from "vitest";
import { withInFlightGuard } from "../utils/inFlightGuard.js";

describe("withInFlightGuard", () => {
  it("runs the function and returns its result", async () => {
    const result = await withInFlightGuard("key-1", async () => "done");
    expect(result).toBe("done");
  });

  it("rejects a second call with the same key while the first is still running", async () => {
    let resolveFirst;
    const first = withInFlightGuard(
      "key-2",
      () => new Promise((resolve) => (resolveFirst = resolve))
    );

    await expect(withInFlightGuard("key-2", async () => "second")).rejects.toThrow(
      "already in progress"
    );

    resolveFirst("first-result");
    await expect(first).resolves.toBe("first-result");
  });

  it("releases the key after the function throws, so a retry is allowed", async () => {
    await expect(
      withInFlightGuard("key-3", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    await expect(withInFlightGuard("key-3", async () => "retried")).resolves.toBe("retried");
  });

  it("allows concurrent calls with different keys", async () => {
    const [a, b] = await Promise.all([
      withInFlightGuard("key-4a", async () => "a"),
      withInFlightGuard("key-4b", async () => "b"),
    ]);
    expect(a).toBe("a");
    expect(b).toBe("b");
  });
});
