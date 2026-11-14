import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import EditableTitle from "./EditableTitle";

describe("EditableTitle", () => {
  it("shows the title and no rename button when read-only (demo)", () => {
    render(<EditableTitle title="Biology" onSave={vi.fn()} readOnly />);
    expect(screen.getByRole("heading", { name: "Biology" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rename/i })).not.toBeInTheDocument();
  });

  it("saves a trimmed new title on Enter", async () => {
    const onSave = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    render(<EditableTitle title="Biology" onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /rename document/i }));
    const input = screen.getByRole("textbox", { name: /document title/i });
    await user.clear(input);
    await user.type(input, "  Cell Biology {Enter}");
    expect(onSave).toHaveBeenCalledWith("Cell Biology");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("doesn't call save for an unchanged or empty title, and Escape cancels", async () => {
    const onSave = vi.fn().mockResolvedValue();
    const user = userEvent.setup();
    render(<EditableTitle title="Biology" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: /rename document/i }));
    await user.click(screen.getByRole("button", { name: /save title/i }));
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /rename document/i }));
    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: /save title/i }));
    expect(onSave).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Biology" })).toBeInTheDocument();
  });

  it("stays in edit mode when saving fails", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();
    render(<EditableTitle title="Biology" onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /rename document/i }));
    await user.type(screen.getByRole("textbox"), "!{Enter}");
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
  });
});
