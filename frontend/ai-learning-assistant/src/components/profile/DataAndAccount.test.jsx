import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DataAndAccount from "./DataAndAccount";
import { AuthContext } from "../../hooks/useAuth";
import { downloadMyData, deleteAccount } from "../../services/authService";

vi.mock("../../services/authService", () => ({ downloadMyData: vi.fn(), deleteAccount: vi.fn() }));

const logout = vi.fn();
const renderIt = (user = { username: "A" }) =>
  render(
    <AuthContext.Provider value={{ user, logout }}>
      <MemoryRouter>
        <DataAndAccount />
      </MemoryRouter>
    </AuthContext.Provider>
  );

beforeEach(() => {
  vi.mocked(downloadMyData).mockReset().mockResolvedValue();
  vi.mocked(deleteAccount).mockReset().mockResolvedValue({});
  logout.mockReset();
});

describe("DataAndAccount", () => {
  it("downloads the user's data", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /download my data/i }));
    expect(downloadMyData).toHaveBeenCalled();
  });

  it("won't delete until a password is entered, then deletes and signs out", async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole("button", { name: /delete account/i }));
    const confirm = screen.getByRole("button", { name: /delete everything/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText("Password"), "hunter22");
    await user.click(confirm);
    expect(deleteAccount).toHaveBeenCalledWith("hunter22");
    expect(logout).toHaveBeenCalled();
  });

  it("keeps the account (and the dialog) when the server rejects the password", async () => {
    vi.mocked(deleteAccount).mockRejectedValue(new Error("Incorrect password"));
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole("button", { name: /delete account/i }));
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /delete everything/i }));
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("hides Delete account for the shared demo user", () => {
    renderIt({ username: "Demo", isDemo: true });
    expect(screen.queryByRole("button", { name: /delete account/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download my data/i })).toBeInTheDocument();
  });
});
