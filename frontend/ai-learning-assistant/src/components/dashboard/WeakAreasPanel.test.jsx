import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WeakAreasPanel from "./WeakAreasPanel";
import { getMastery } from "../../services/masteryService";

vi.mock("../../services/masteryService", () => ({ getMastery: vi.fn() }));

const renderPanel = () =>
  render(
    <MemoryRouter>
      <WeakAreasPanel />
    </MemoryRouter>
  );

describe("WeakAreasPanel", () => {
  beforeEach(() => {
    getMastery.mockReset();
  });

  it("renders nothing once loaded if there are no weak concepts yet", async () => {
    getMastery.mockResolvedValue({ data: { items: [], weakest: [] } });
    const { container } = renderPanel();

    await vi.waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
    expect(container.textContent).toBe("");
  });

  it("shows each weak concept with its mastery percentage and source document", async () => {
    getMastery.mockResolvedValue({
      data: {
        items: [],
        weakest: [
          { concept: "eigenvalues", documentId: "doc1", documentTitle: "Linear Algebra", pKnown: 0.22, opportunities: 3, mastered: false },
        ],
      },
    });
    renderPanel();

    expect(await screen.findByText("eigenvalues")).toBeInTheDocument();
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByText("Linear Algebra")).toBeInTheDocument();
  });

  it("degrades to an empty (nothing shown) state rather than an error if the request fails", async () => {
    getMastery.mockRejectedValue(new Error("network error"));
    const { container } = renderPanel();

    await vi.waitFor(() => expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument());
    expect(container.textContent).toBe("");
  });
});
