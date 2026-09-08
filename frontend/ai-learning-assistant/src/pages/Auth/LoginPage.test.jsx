import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LoginPage from "./LoginPage";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("LoginPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("shows validation errors and never calls login for invalid input", async () => {
    const login = vi.fn();
    useAuth.mockReturnValue({ login });
    render(<LoginPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.type(screen.getByLabelText(/password/i), "123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("logs in with the entered credentials and navigates to the dashboard", async () => {
    const login = vi.fn().mockResolvedValue({ id: "u1" });
    useAuth.mockReturnValue({ login });
    render(<LoginPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/email/i), "alice@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: "alice@example.com", password: "password123" })
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("stays on the page and re-enables the form when login rejects", async () => {
    const login = vi.fn().mockRejectedValue(new Error("Invalid email or password"));
    useAuth.mockReturnValue({ login });
    render(<LoginPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/email/i), "alice@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /sign in/i })).not.toBeDisabled();
  });
});
