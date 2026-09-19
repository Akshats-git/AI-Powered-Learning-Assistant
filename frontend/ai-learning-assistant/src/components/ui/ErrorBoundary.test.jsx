import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary from "./ErrorBoundary";

const Boom = ({ explode = true }) => {
  if (explode) throw new Error("kaboom");
  return <p>all good</p>;
};

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(<ErrorBoundary><Boom explode={false} /></ErrorBoundary>);
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("replaces a crashed subtree with an alert instead of a blank screen", () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(screen.queryByText("all good")).not.toBeInTheDocument();
  });

  it("'Try again' re-renders the children", async () => {
    let explode = true;
    const Flaky = () => <Boom explode={explode} />;
    render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    explode = false;
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("clears the error when resetKey changes (navigating away from the broken page)", () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/b"><Boom explode={false} /></ErrorBoundary>);
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("copies error details for a bug report", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    await userEvent.click(screen.getByRole("button", { name: /copy error details/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("kaboom"));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });
});
