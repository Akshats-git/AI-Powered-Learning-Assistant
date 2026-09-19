import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ContentTab from "./ContentTab";

const doc = { title: "Paper", fileUrl: "/uploads/p.pdf" };

describe("ContentTab", () => {
  it("shows the PDF from its start by default", () => {
    render(<ContentTab document={doc} />);
    expect(screen.getByTitle("Paper").getAttribute("src")).toMatch(/\/uploads\/p\.pdf$/);
    expect(screen.queryByText(/showing page/i)).not.toBeInTheDocument();
  });

  it("opens on a specific page via the #page fragment, and says which", () => {
    render(<ContentTab document={doc} page={22} />);
    expect(screen.getByTitle("Paper").getAttribute("src")).toMatch(/\/uploads\/p\.pdf#page=22$/);
    expect(screen.getByText("Showing page 22")).toBeInTheDocument();
  });

  it("remounts the viewer when the page changes (a fragment change alone doesn't scroll a PDF viewer)", () => {
    const { rerender } = render(<ContentTab document={doc} page={3} />);
    const first = screen.getByTitle("Paper");
    rerender(<ContentTab document={doc} page={5} />);
    expect(screen.getByTitle("Paper")).not.toBe(first);
  });
});
