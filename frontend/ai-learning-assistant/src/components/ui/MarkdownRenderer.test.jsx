import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MarkdownRenderer from "./MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("renders markdown without loading the syntax highlighter", () => {
    render(<MarkdownRenderer content={"# Title\n\nSome **bold** text and `inline` code."} />);
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("inline")).toBeInTheDocument();
  });

  it("shows fenced code immediately as plain text, then swaps in the highlighted block once it loads", async () => {
    const { container } = render(<MarkdownRenderer content={"```js\nconst answer = 42;\n```"} />);
    expect(container.textContent).toContain("const answer = 42;");
    // Prism wraps tokens in spans once the lazy chunk has resolved. The first
    // import transforms a ~600 KB module, which can take several seconds when
    // the whole suite is running in parallel — hence the generous budget.
    await screen.findByText("42", {}, { timeout: 15000 });
    expect(container.querySelector(".token, span[style]")).not.toBeNull();
  }, 20000);
});
