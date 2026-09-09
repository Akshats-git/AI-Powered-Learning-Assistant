import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import VerifyEmailBanner from "./VerifyEmailBanner";
import * as authService from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../services/authService");
vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

describe("VerifyEmailBanner", () => {
  it("renders nothing when the user is verified", () => {
    useAuth.mockReturnValue({ user: { emailVerifiedAt: "2024-01-01T00:00:00.000Z" } });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there's no user", () => {
    useAuth.mockReturnValue({ user: null });
    const { container } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a resend button for an unverified user and calls the API", async () => {
    useAuth.mockReturnValue({ user: { emailVerifiedAt: null } });
    authService.resendVerification.mockResolvedValue({});
    render(<VerifyEmailBanner />);

    await userEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    await waitFor(() => expect(authService.resendVerification).toHaveBeenCalled());
  });

  it("dismisses when the close button is clicked", async () => {
    useAuth.mockReturnValue({ user: { emailVerifiedAt: null } });
    const { container } = render(<VerifyEmailBanner />);

    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(container).toBeEmptyDOMElement();
  });
});
