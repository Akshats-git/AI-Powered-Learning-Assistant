import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ActiveSessions from "./ActiveSessions";
import * as authService from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../services/authService");
vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const session = (overrides = {}) => ({
  familyId: "family-1",
  userAgent: "Mozilla/5.0 Chrome/1.0",
  ip: "127.0.0.1",
  lastActiveAt: "2024-01-01T00:00:00.000Z",
  isCurrent: false,
  ...overrides,
});

describe("ActiveSessions", () => {
  it("lists sessions and marks the current device", async () => {
    useAuth.mockReturnValue({ logout: vi.fn() });
    authService.listSessions.mockResolvedValue({
      data: { sessions: [session({ familyId: "a", isCurrent: true }), session({ familyId: "b" })] },
    });

    render(<ActiveSessions />);

    expect(await screen.findByText(/this device/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chrome/i)).toHaveLength(2);
  });

  it("shows an empty state when there are no sessions", async () => {
    useAuth.mockReturnValue({ logout: vi.fn() });
    authService.listSessions.mockResolvedValue({ data: { sessions: [] } });

    render(<ActiveSessions />);
    expect(await screen.findByText(/no active sessions/i)).toBeInTheDocument();
  });

  it("removes another device's session from the list on revoke, without logging out", async () => {
    const logout = vi.fn();
    useAuth.mockReturnValue({ logout });
    authService.listSessions.mockResolvedValue({ data: { sessions: [session({ familyId: "b" })] } });
    authService.revokeSession.mockResolvedValue({});

    render(<ActiveSessions />);
    await screen.findByText(/chrome/i);

    await userEvent.click(screen.getByRole("button", { name: /revoke/i }));

    await waitFor(() => expect(authService.revokeSession).toHaveBeenCalledWith("b"));
    expect(screen.queryByText(/chrome/i)).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("logs out locally when the current device's own session is revoked", async () => {
    const logout = vi.fn();
    useAuth.mockReturnValue({ logout });
    authService.listSessions.mockResolvedValue({ data: { sessions: [session({ familyId: "a", isCurrent: true })] } });
    authService.revokeSession.mockResolvedValue({});

    render(<ActiveSessions />);
    await screen.findByText(/this device/i);

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(authService.revokeSession).toHaveBeenCalledWith("a"));
    expect(logout).toHaveBeenCalled();
  });
});
