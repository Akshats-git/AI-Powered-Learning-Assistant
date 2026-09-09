import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatTab from "./ChatTab";
import { getChatHistory, sendChatMessage } from "../../../services/aiService";

vi.mock("../../../services/aiService", () => ({
  getChatHistory: vi.fn(),
  sendChatMessage: vi.fn(),
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
    sendChatMessage.mockReset();
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
    sendChatMessage.mockResolvedValue({
      data: { reply: "ATP is produced by the mitochondria.", sources: ASSISTANT_WITH_SOURCES.sources, messages: [ASSISTANT_WITH_SOURCES] },
    });

    render(<ChatTab documentId="doc-1" />);
    await screen.findByPlaceholderText(/ask a question/i);

    await userEvent.type(screen.getByPlaceholderText(/ask a question/i), "How is ATP produced?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("ATP is produced by the mitochondria.");
    expect(screen.getByRole("button", { name: /1 source/i })).toBeInTheDocument();
  });
});
