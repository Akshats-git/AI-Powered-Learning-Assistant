import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import ChatSources from "./ChatSources";

const SOURCES = [
  { chunkId: "c1", page: 4, endPage: 4, sectionPath: ["Cell Biology", "Mitochondria"], snippet: "The mitochondria is the powerhouse of the cell." },
  { chunkId: "c2", page: 9, endPage: 10, sectionPath: [], snippet: "ATP synthase drives phosphorylation." },
];

describe("ChatSources", () => {
  it("renders nothing when there are no sources", () => {
    const { container } = render(<ChatSources sources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when sources is undefined (a user message, or a non-retrieval reply)", () => {
    const { container } = render(<ChatSources sources={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a collapsed toggle with the source count and nothing else by default", () => {
    render(<ChatSources sources={SOURCES} />);

    expect(screen.getByRole("button", { name: /2 sources/i })).toBeInTheDocument();
    expect(screen.queryByText(/powerhouse of the cell/i)).not.toBeInTheDocument();
  });

  it("uses singular wording for exactly one source", () => {
    render(<ChatSources sources={[SOURCES[0]]} />);
    expect(screen.getByRole("button", { name: /1 source$/i })).toBeInTheDocument();
  });

  it("expands to show each source's page, section, and snippet on click", async () => {
    render(<ChatSources sources={SOURCES} />);

    await userEvent.click(screen.getByRole("button", { name: /2 sources/i }));

    expect(screen.getByText("p. 4")).toBeInTheDocument();
    expect(screen.getByText("Cell Biology > Mitochondria")).toBeInTheDocument();
    expect(screen.getByText(/powerhouse of the cell/i)).toBeInTheDocument();
    expect(screen.getByText("p. 9–10")).toBeInTheDocument();
  });

  it("collapses again on a second click", async () => {
    render(<ChatSources sources={SOURCES} />);
    const toggle = screen.getByRole("button", { name: /2 sources/i });

    await userEvent.click(toggle);
    expect(screen.getByText(/powerhouse of the cell/i)).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByText(/powerhouse of the cell/i)).not.toBeInTheDocument();
  });

  it("omits the page badge when a source has no page (no page map for the document)", async () => {
    render(<ChatSources sources={[{ chunkId: "c3", page: null, endPage: null, sectionPath: [], snippet: "No page info." }]} />);
    await userEvent.click(screen.getByRole("button", { name: /1 source/i }));

    expect(screen.queryByText(/^p\./)).not.toBeInTheDocument();
    expect(screen.getByText("No page info.")).toBeInTheDocument();
  });

  describe("groundedness warning", () => {
    it("shows nothing extra when groundedness wasn't checked (undefined)", () => {
      render(<ChatSources sources={SOURCES} groundedness={undefined} />);
      expect(screen.queryByText(/may not be fully supported/i)).not.toBeInTheDocument();
    });

    it("shows nothing extra when the reply was fully grounded", () => {
      render(<ChatSources sources={SOURCES} groundedness={{ grounded: true, unsupportedClaims: [] }} />);
      expect(screen.queryByText(/may not be fully supported/i)).not.toBeInTheDocument();
    });

    it("shows a warning, always expanded, when the reply was flagged as ungrounded", () => {
      render(
        <ChatSources
          sources={SOURCES}
          groundedness={{ grounded: false, unsupportedClaims: ["The study covered 10,000 patients."] }}
        />
      );

      expect(screen.getByText(/may not be fully supported/i)).toBeInTheDocument();
      // Unlike sources, the warning isn't behind a click — it's a warning, not detail.
      expect(screen.getByText("The study covered 10,000 patients.")).toBeInTheDocument();
    });

    it("renders the warning even when there are no sources at all", () => {
      const { container } = render(<ChatSources sources={[]} groundedness={{ grounded: false, unsupportedClaims: [] }} />);

      expect(screen.getByText(/may not be fully supported/i)).toBeInTheDocument();
      expect(container).not.toBeEmptyDOMElement();
    });
  });
});
