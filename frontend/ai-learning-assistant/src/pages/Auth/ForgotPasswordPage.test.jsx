import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import ForgotPasswordPage from "./ForgotPasswordPage";
import * as authService from "../../services/authService";

vi.mock("../../services/authService");

describe("ForgotPasswordPage", () => {
  it("shows a validation error for an invalid email and never calls the API", async () => {
    render(<ForgotPasswordPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(authService.forgotPassword).not.toHaveBeenCalled();
  });

  it("submits the email and shows a confirmation message", async () => {
    authService.forgotPassword.mockResolvedValue({});
    render(<ForgotPasswordPage />, { wrapper: MemoryRouter });

    await userEvent.type(screen.getByLabelText(/email/i), "alice@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => expect(authService.forgotPassword).toHaveBeenCalledWith({ email: "alice@example.com" }));
    expect(await screen.findByText(/reset link is on its way/i)).toBeInTheDocument();
  });
});
