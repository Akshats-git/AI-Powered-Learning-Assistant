import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import VerifyEmailPage from "./VerifyEmailPage";
import * as authService from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../services/authService");
vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

let searchParamsValue = "?token=abc123";
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(searchParamsValue)],
  };
});

describe("VerifyEmailPage", () => {
  it("shows an invalid-link message when there's no token", () => {
    searchParamsValue = "";
    useAuth.mockReturnValue({ user: null, updateUser: vi.fn() });
    render(<VerifyEmailPage />, { wrapper: MemoryRouter });
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
  });

  it("verifies the token and shows success", async () => {
    searchParamsValue = "?token=abc123";
    useAuth.mockReturnValue({ user: null, updateUser: vi.fn() });
    authService.verifyEmail.mockResolvedValue({});
    render(<VerifyEmailPage />, { wrapper: MemoryRouter });

    expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
    expect(authService.verifyEmail).toHaveBeenCalledWith({ token: "abc123" });
  });

  it("shows an error state when the token is rejected", async () => {
    searchParamsValue = "?token=bad-token";
    useAuth.mockReturnValue({ user: null, updateUser: vi.fn() });
    authService.verifyEmail.mockRejectedValue(new Error("Invalid or expired verification link"));
    render(<VerifyEmailPage />, { wrapper: MemoryRouter });

    expect(await screen.findByText(/verification failed/i)).toBeInTheDocument();
  });
});
