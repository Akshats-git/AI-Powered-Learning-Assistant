import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import OfflineBanner from "./OfflineBanner";

const setOnline = (value) => Object.defineProperty(navigator, "onLine", { value, configurable: true });

afterEach(() => setOnline(true));

describe("OfflineBanner", () => {
  it("is hidden while online", () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("appears when the browser goes offline and disappears when it's back", () => {
    setOnline(true);
    render(<OfflineBanner />);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(/you're offline/i);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows straight away if the page loads while already offline", () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
