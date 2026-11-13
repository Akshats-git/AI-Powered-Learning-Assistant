import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ContentTab from "./ContentTab";
import { fetchDocumentFile } from "../../../services/documentService";

vi.mock("../../../services/documentService", () => ({ fetchDocumentFile: vi.fn() }));

const doc = { title: "Paper", fileUrl: "/api/documents/abc/file" };

beforeEach(() => {
  vi.mocked(fetchDocumentFile).mockReset().mockResolvedValue({ data: new Blob(["%PDF-"]) });
  URL.createObjectURL = vi.fn(() => "blob:http://app/pdf-1");
  URL.revokeObjectURL = vi.fn();
});

describe("ContentTab", () => {
  it("fetches the PDF with auth and shows it from a blob: URL, from its start by default", async () => {
    render(<ContentTab document={doc} />);
    expect(fetchDocumentFile).toHaveBeenCalledWith("/api/documents/abc/file");
    expect((await screen.findByTitle("Paper")).getAttribute("src")).toBe("blob:http://app/pdf-1");
    expect(screen.getByRole("link", { name: /open in new tab/i })).toHaveAttribute("href", "blob:http://app/pdf-1");
    expect(screen.queryByText(/showing page/i)).not.toBeInTheDocument();
  });

  it("opens on a specific page via the #page fragment, and says which", async () => {
    render(<ContentTab document={doc} page={22} />);
    expect((await screen.findByTitle("Paper")).getAttribute("src")).toBe("blob:http://app/pdf-1#page=22");
    expect(screen.getByText("Showing page 22")).toBeInTheDocument();
  });

  it("remounts the viewer when the page changes (a fragment change alone doesn't scroll a PDF viewer)", async () => {
    const { rerender } = render(<ContentTab document={doc} page={3} />);
    const first = await screen.findByTitle("Paper");
    rerender(<ContentTab document={doc} page={5} />);
    expect(screen.getByTitle("Paper")).not.toBe(first);
  });

  it("revokes the blob URL when unmounted", async () => {
    const { unmount } = render(<ContentTab document={doc} />);
    await screen.findByTitle("Paper");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://app/pdf-1");
  });

  it("doesn't fetch a file the server already reported missing", () => {
    render(<ContentTab document={{ ...doc, fileMissing: true }} />);
    expect(fetchDocumentFile).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn.t be loaded/i)).toBeInTheDocument();
  });

  it("shows a message instead of a blank frame when the fetch fails", async () => {
    vi.mocked(fetchDocumentFile).mockRejectedValue(new Error("nope"));
    render(<ContentTab document={doc} />);
    expect(await screen.findByText(/couldn.t be loaded/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Paper")).not.toBeInTheDocument();
  });
});
