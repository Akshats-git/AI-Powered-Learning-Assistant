import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RegisterPage from "./RegisterPage";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

describe("RegisterPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("rejects a too-short username, an invalid email, and a short password without calling register", async () => {
    const register = vi.fn();
    useAuth.mockReturnValue({ register });
    render(<RegisterPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/username/i), "A");
    await userEvent.type(screen.getByLabelText(/email/i), "nope");
    await userEvent.type(screen.getByLabelText(/password/i), "123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/username must be at least/i)).toBeInTheDocument();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers with the entered details and navigates to the dashboard", async () => {
    const register = vi.fn().mockResolvedValue({ id: "u1" });
    useAuth.mockReturnValue({ register });
    render(<RegisterPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/username/i), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/email/i), "jane@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        username: "Jane Doe",
        email: "jane@example.com",
        password: "password123",
      })
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("does not navigate when register rejects (e.g. duplicate email)", async () => {
    const register = vi.fn().mockRejectedValue(new Error("Email already in use"));
    useAuth.mockReturnValue({ register });
    render(<RegisterPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/username/i), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/email/i), "jane@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
