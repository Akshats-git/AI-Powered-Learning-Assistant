import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";

describe("Modal", () => {
  it("is exposed to assistive tech as a modal dialog named by its title", () => {
    render(<Modal title="Generate Quiz" onClose={() => {}}>body</Modal>);
    const dialog = screen.getByRole("dialog", { name: "Generate Quiz" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Modal title="T" onClose={onClose}>body</Modal>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop and the Close button", async () => {
    const onClose = vi.fn();
    const { container } = render(<Modal title="T" onClose={onClose}>body</Modal>);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(container.querySelector('[aria-hidden="true"]'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves focus to the first field in the body, not the header's Close button", () => {
    render(
      <Modal title="T" onClose={() => {}}>
        <input aria-label="Count" />
      </Modal>
    );
    expect(screen.getByLabelText("Count")).toHaveFocus();
  });

  it("falls back to the first focusable control when the body has no field", () => {
    render(<Modal title="T" onClose={() => {}}>just text</Modal>);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    render(
      <Modal title="T" onClose={() => {}} footer={<button>Save</button>}>
        <input aria-label="Count" />
      </Modal>
    );
    const close = screen.getByRole("button", { name: "Close" });
    const save = screen.getByRole("button", { name: "Save" });

    save.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it("returns focus to the element that opened it once closed", async () => {
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && <Modal title="T" onClose={() => setOpen(false)}>body</Modal>}
        </>
      );
    };
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("does not steal focus back while the user types (a new inline onClose every render)", async () => {
    const Harness = () => {
      const [value, setValue] = useState("");
      return (
        <Modal title="T" onClose={() => setValue("")}>
          <input aria-label="Count" value={value} onChange={(e) => setValue(e.target.value)} />
          <button>Other</button>
        </Modal>
      );
    };
    render(<Harness />);
    const input = screen.getByLabelText("Count");
    await userEvent.type(input, "12");
    expect(input).toHaveValue("12");
    expect(input).toHaveFocus();
  });
});
