import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ApiKeySettings from "./ApiKeySettings";
import * as authService from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../services/authService");
vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

describe("ApiKeySettings", () => {
  it("shows an input to add a key when the user has none saved", () => {
    useAuth.mockReturnValue({ user: { aiSharedKeyConfigured: true }, updateUser: vi.fn() });

    render(<ApiKeySettings />);

    expect(screen.getByPlaceholderText("sk-...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("mentions the shared key's usage cap when one is configured server-side", () => {
    useAuth.mockReturnValue({ user: { aiSharedKeyConfigured: true }, updateUser: vi.fn() });
    render(<ApiKeySettings />);
    expect(screen.getByText(/shared key/i)).toBeInTheDocument();
  });

  it("warns that AI features need a key at all when no shared key is configured", () => {
    useAuth.mockReturnValue({ user: { aiSharedKeyConfigured: false }, updateUser: vi.fn() });
    render(<ApiKeySettings />);
    expect(screen.getByText(/no shared key configured/i)).toBeInTheDocument();
  });

  it("saves a key and reflects the masked value via updateUser", async () => {
    const updateUser = vi.fn();
    useAuth.mockReturnValue({ user: { aiSharedKeyConfigured: true }, updateUser });
    authService.saveApiKey.mockResolvedValue({ data: { openaiApiKeyLast4: "ABCD" } });

    render(<ApiKeySettings />);

    await userEvent.type(screen.getByPlaceholderText("sk-..."), "sk-abcdefghijklmnopqrstuvwxyzABCD");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(authService.saveApiKey).toHaveBeenCalledWith("sk-abcdefghijklmnopqrstuvwxyzABCD"));
    expect(updateUser).toHaveBeenCalledWith({ openaiApiKeyLast4: "ABCD" });
  });

  it("shows the masked key and a remove option once one is saved", () => {
    useAuth.mockReturnValue({ user: { aiSharedKeyConfigured: true, openaiApiKeyLast4: "WXYZ" }, updateUser: vi.fn() });

    render(<ApiKeySettings />);

    expect(screen.getByText(/ending in/i)).toBeInTheDocument();
    expect(screen.getByText("WXYZ")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("sk-...")).not.toBeInTheDocument();
  });

  it("removes the key after confirming", async () => {
    const updateUser = vi.fn();
    useAuth.mockReturnValue({ user: { aiSharedKeyConfigured: true, openaiApiKeyLast4: "WXYZ" }, updateUser });
    authService.removeApiKey.mockResolvedValue({});

    render(<ApiKeySettings />);

    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(authService.removeApiKey).toHaveBeenCalled());
    expect(updateUser).toHaveBeenCalledWith({ openaiApiKeyLast4: null });
  });
});
