import { describe, it, expect, vi, beforeEach } from "vitest";
import axiosInstance from "../utils/axiosInstance";
import { generateFlashcards, generateQuiz, sendChatMessage, getSummary, newIdempotencyKey } from "./aiService";

vi.mock("../utils/axiosInstance", () => ({ default: { post: vi.fn(() => Promise.resolve({ data: {} })), get: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

const keyOf = (call) => call[2]?.headers?.["Idempotency-Key"];

describe("aiService idempotency keys", () => {
  it("sends an Idempotency-Key on the paid, state-creating calls", async () => {
    await generateFlashcards("d1", 5);
    await generateQuiz("d1", 5);
    await sendChatMessage("d1", "hi");
    for (const call of axiosInstance.post.mock.calls) expect(keyOf(call)).toMatch(/^[A-Za-z0-9_\-:.]{8,128}$/);
  });

  it("uses a different key for each user action (two clicks are two requests)", async () => {
    await generateFlashcards("d1", 5);
    await generateFlashcards("d1", 5);
    expect(keyOf(axiosInstance.post.mock.calls[0])).not.toBe(keyOf(axiosInstance.post.mock.calls[1]));
  });

  it("leaves idempotent-by-nature calls alone", async () => {
    await getSummary("d1");
    expect(keyOf(axiosInstance.post.mock.calls[0])).toBeUndefined();
  });

  it("newIdempotencyKey always produces a server-acceptable key", () => {
    expect(newIdempotencyKey()).toMatch(/^[A-Za-z0-9_\-:.]{8,128}$/);
  });
});
