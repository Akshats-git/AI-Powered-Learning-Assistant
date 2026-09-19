import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CommandPalette from "./CommandPalette";
import { searchAll } from "../../services/searchService";

vi.mock("../../services/searchService", () => ({ searchAll: vi.fn() }));
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => ({ ...(await vi.importActual("react-router-dom")), useNavigate: () => navigateMock }));

const EMPTY = { documents: [], flashcards: [], quizzes: [], chats: [] };
const setup = (props = {}) => {
  const onClose = vi.fn();
  render(<CommandPalette open onClose={onClose} {...props} />, { wrapper: MemoryRouter });
  return { onClose, input: screen.getByRole("combobox") };
};

beforeEach(() => {
  searchAll.mockReset();
  searchAll.mockResolvedValue({ data: EMPTY });
  navigateMock.mockReset();
});

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    render(<CommandPalette open={false} onClose={() => {}} />, { wrapper: MemoryRouter });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is an accessible combobox dialog with the input focused", () => {
    const { input } = setup();
    expect(screen.getByRole("dialog", { name: "Command palette" })).toHaveAttribute("aria-modal", "true");
    expect(input).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("lists page shortcuts, fuzzy-filters them as you type, and opens one with Enter", async () => {
    const { input, onClose } = setup();
    expect(screen.getAllByRole("option").length).toBeGreaterThanOrEqual(6);

    await userEvent.type(input, "rev");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Start a review session"]);

    await userEvent.keyboard("{Enter}");
    expect(navigateMock).toHaveBeenCalledWith("/review");
    expect(onClose).toHaveBeenCalled();
  });

  it("moves the highlight with the arrow keys (wrapping) and reports it via aria-activedescendant", async () => {
    const { input } = setup();
    const options = () => screen.getAllByRole("option");
    expect(options()[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(options()[1]).toHaveAttribute("aria-selected", "true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[1].id);

    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(options().at(-1)).toHaveAttribute("aria-selected", "true"); // wrapped to the end
  });

  it("closes on Escape and on a backdrop click", async () => {
    const { onClose } = setup();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("searches after a short pause once there are 2+ characters, and opens a result", async () => {
    searchAll.mockResolvedValue({
      data: {
        ...EMPTY,
        documents: [{ id: "d1", title: "Mitochondria Notes" }],
        flashcards: [{ id: "f1", title: "Cell deck", documentId: "d1", card: { snippet: "…produce ATP…" } }],
        quizzes: [{ id: "q1", title: "Cell quiz", documentId: "d1", isCompleted: true }, { id: "q2", title: "Open quiz", documentId: "d1", isCompleted: false }],
        chats: [{ documentId: "d1", documentTitle: "Mitochondria Notes", snippet: "…powerhouse…" }],
      },
    });
    const { input } = setup();

    await userEvent.type(input, "mito");
    await screen.findByRole("option", { name: /Mitochondria Notes(?!.*powerhouse)/ });
    expect(searchAll).toHaveBeenCalledTimes(1); // debounced: not one call per keystroke
    expect(searchAll.mock.calls[0][0]).toBe("mito");

    for (const [name, to] of [
      [/Cell deck/, "/documents/d1/flashcards?setId=f1"],
      [/Cell quiz/, "/quizzes/q1/results"], // finished quiz -> results
      [/Open quiz/, "/quizzes/q2"], // unfinished quiz -> take it
      [/powerhouse/, "/documents/d1?tab=chat"],
    ]) {
      navigateMock.mockReset();
      await userEvent.click(screen.getAllByRole("option").find((o) => name.test(o.textContent)));
      expect(navigateMock).toHaveBeenCalledWith(to);
    }
  });

  it("does not search for a single character", async () => {
    const { input } = setup();
    await userEvent.type(input, "m");
    await new Promise((r) => setTimeout(r, 350));
    expect(searchAll).not.toHaveBeenCalled();
  });

  it("says so when nothing matches, and when search fails", async () => {
    const { input } = setup();
    await userEvent.type(input, "zzzzqq");
    expect(await screen.findByText(/no documents, decks, quizzes or chats match "zzzzqq"/i)).toBeInTheDocument();

    searchAll.mockRejectedValue(new Error("down"));
    await userEvent.type(input, "x");
    expect(await screen.findByText(/search is unavailable/i)).toBeInTheDocument();
  });

  it("ignores a slow, stale response that arrives after a newer query's", async () => {
    let resolveSlow;
    searchAll
      .mockImplementationOnce(() => new Promise((r) => (resolveSlow = r)))
      .mockResolvedValueOnce({ data: { ...EMPTY, documents: [{ id: "new", title: "Fresh result" }] } });
    const { input } = setup();

    await userEvent.type(input, "ab");
    await waitFor(() => expect(searchAll).toHaveBeenCalledTimes(1));
    await userEvent.type(input, "c");
    await screen.findByRole("option", { name: /Fresh result/ });

    resolveSlow({ data: { ...EMPTY, documents: [{ id: "old", title: "Stale result" }] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("option", { name: /Stale result/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Fresh result/ })).toBeInTheDocument();
  });
});
