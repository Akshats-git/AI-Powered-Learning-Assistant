import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGlobalHotkeys } from "./useGlobalHotkeys";

const setup = () => {
  const handlers = { onPalette: vi.fn(), onShortcuts: vi.fn() };
  renderHook(() => useGlobalHotkeys(handlers));
  return handlers;
};

describe("useGlobalHotkeys", () => {
  it("Ctrl+K and Cmd+K open the palette", async () => {
    const h = setup();
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(h.onPalette).toHaveBeenCalledTimes(2);
  });

  it("'/' opens the palette and '?' the shortcuts sheet when nothing is focused", async () => {
    const h = setup();
    await userEvent.keyboard("/");
    await userEvent.keyboard("?");
    expect(h.onPalette).toHaveBeenCalledTimes(1);
    expect(h.onShortcuts).toHaveBeenCalledTimes(1);
  });

  it("never hijacks single keys while the user is typing in a field", async () => {
    const h = setup();
    const input = document.body.appendChild(document.createElement("input"));
    input.focus();
    await userEvent.keyboard("a/b?c");
    expect(h.onPalette).not.toHaveBeenCalled();
    expect(h.onShortcuts).not.toHaveBeenCalled();
    input.remove();
  });

  it("Ctrl+K still works while typing in a field (it's a modifier chord)", async () => {
    const h = setup();
    const input = document.body.appendChild(document.createElement("textarea"));
    input.focus();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(h.onPalette).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("leaves other modifier chords to the browser", async () => {
    const h = setup();
    await userEvent.keyboard("{Control>}/{/Control}");
    expect(h.onPalette).not.toHaveBeenCalled();
  });
});
