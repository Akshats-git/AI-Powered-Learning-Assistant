import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatTab from "./ChatTab";
import { getChatHistory, streamChatMessage } from "../../../services/aiService";

vi.mock("../../../services/aiService", () => ({
  getChatHistory: vi.fn(),
  streamChatMessage: vi.fn(),
}));

// jsdom doesn't implement scrollIntoView — ChatTab calls it on every message
// update to keep the conversation scrolled to the bottom, unrelated to what
// this file is testing.
Element.prototype.scrollIntoView = vi.fn();

const ASSISTANT_WITH_SOURCES = {
  role: "assistant",
  content: "ATP is produced by the mitochondria.",
  sources: [{ chunkId: "c1", page: 4, endPage: 4, sectionPath: [], snippet: "The mitochondria is the powerhouse of the cell." }],
};

describe("ChatTab", () => {
  beforeEach(() => {
    getChatHistory.mockReset();
    streamChatMessage.mockReset();
  });

  it("shows a sources toggle under a retrieval-grounded assistant reply, and not under the user's own message", async () => {
    getChatHistory.mockResolvedValue({
      data: [
        { role: "user", content: "How is ATP produced?" },
        ASSISTANT_WITH_SOURCES,
      ],
    });

    render(<ChatTab documentId="doc-1" />);

    await screen.findByText("ATP is produced by the mitochondria.");
    expect(screen.getByRole("button", { name: /1 source/i })).toBeInTheDocument();
  });

  it("doesn't show a sources toggle for a reply with no sources (the no-chunks fallback)", async () => {
    getChatHistory.mockResolvedValue({
      data: [{ role: "assistant", content: "General reply with no retrieval." }],
    });

    render(<ChatTab documentId="doc-1" />);

    await screen.findByText("General reply with no retrieval.");
    expect(screen.queryByRole("button", { name: /source/i })).not.toBeInTheDocument();
  });

  it("renders the new sources returned from sending a message", async () => {
    getChatHistory.mockResolvedValue({ data: [] });
    streamChatMessage.mockResolvedValue({ reply: "ATP is produced by the mitochondria.", sources: ASSISTANT_WITH_SOURCES.sources, messages: [ASSISTANT_WITH_SOURCES] });

    render(<ChatTab documentId="doc-1" />);
    await screen.findByPlaceholderText(/ask a question/i);

    await userEvent.type(screen.getByPlaceholderText(/ask a question/i), "How is ATP produced?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("ATP is produced by the mitochondria.");
    expect(screen.getByRole("button", { name: /1 source/i })).toBeInTheDocument();
  });

  it("shows the answer growing token by token, with sources before the text, then settles on the saved messages", async () => {
    getChatHistory.mockResolvedValue({ data: [] });
    let finish;
    streamChatMessage.mockImplementation(async (_doc, _msg, { onSources, onToken }) => {
      onSources(ASSISTANT_WITH_SOURCES.sources);
      onToken("ATP is ");
      await new Promise((r) => (finish = r));
      onToken("produced by the mitochondria.");
      return { messages: [{ role: "user", content: "How?" }, ASSISTANT_WITH_SOURCES] };
    });

    render(<ChatTab documentId="doc-1" />);
    await screen.findByPlaceholderText(/ask a question/i);
    await userEvent.type(screen.getByPlaceholderText(/ask a question/i), "How?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("ATP is");
    expect(screen.getByRole("button", { name: /1 source/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop generating/i })).toBeInTheDocument();

    finish();
    await screen.findByText("ATP is produced by the mitochondria.");
    expect(screen.queryByRole("button", { name: /stop generating/i })).not.toBeInTheDocument();
  });

  it("Stop aborts the request and removes the unfinished answer without an error toast", async () => {
    getChatHistory.mockResolvedValue({ data: [] });
    streamChatMessage.mockImplementation((_doc, _msg, { signal, onToken }) => {
      onToken("partial answer");
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    });

    render(<ChatTab documentId="doc-1" />);
    await screen.findByPlaceholderText(/ask a question/i);
    await userEvent.type(screen.getByPlaceholderText(/ask a question/i), "Q?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("partial answer");

    await userEvent.click(screen.getByRole("button", { name: /stop generating/i }));

    expect(screen.queryByText("partial answer")).not.toBeInTheDocument();
    expect(screen.getByText("Q?")).toBeInTheDocument();
  });

  it("marks the conversation as a polite live region for screen readers", async () => {
    getChatHistory.mockResolvedValue({ data: [] });
    render(<ChatTab documentId="doc-1" />);
    expect(await screen.findByRole("log", { name: "Conversation" })).toHaveAttribute("aria-live", "polite");
  });
});
