import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import ResetPasswordPage from "./ResetPasswordPage";
import * as authService from "../../services/authService";

vi.mock("../../services/authService");

const navigateMock = vi.fn();
let searchParamsValue = "?token=abc123";
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(searchParamsValue)],
  };
});

describe("ResetPasswordPage", () => {
  it("shows an invalid-link message when there's no token", async () => {
    searchParamsValue = "";
    render(<ResetPasswordPage />, { wrapper: MemoryRouter });
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
  });

  it("validates password length and never calls the API", async () => {
    searchParamsValue = "?token=abc123";
    render(<ResetPasswordPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/new password/i), "123");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText(/at least 6 characters/i)).toBeInTheDocument();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it("submits the token and new password, then navigates to login", async () => {
    searchParamsValue = "?token=abc123";
    authService.resetPassword.mockResolvedValue({});
    render(<ResetPasswordPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/new password/i), "new-password");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() =>
      expect(authService.resetPassword).toHaveBeenCalledWith({ token: "abc123", newPassword: "new-password" })
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/login"));
  });
});
