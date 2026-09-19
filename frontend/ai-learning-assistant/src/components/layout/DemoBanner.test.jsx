import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DemoBanner from "./DemoBanner";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../hooks/useAuth", () => ({ useAuth: vi.fn() }));
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => ({ ...(await vi.importActual("react-router-dom")), useNavigate: () => navigateMock }));

beforeEach(() => navigateMock.mockClear());

describe("DemoBanner", () => {
  it("renders nothing for a normal user", () => {
    useAuth.mockReturnValue({ user: { isDemo: false }, logout: vi.fn() });
    const { container } = render(<DemoBanner />, { wrapper: MemoryRouter });
    expect(container).toBeEmptyDOMElement();
  });

  it("tells the visitor the demo is read-only", () => {
    useAuth.mockReturnValue({ user: { isDemo: true }, logout: vi.fn() });
    render(<DemoBanner />, { wrapper: MemoryRouter });
    expect(screen.getByRole("note")).toHaveTextContent(/read-only demo/i);
  });

  it("'Create a free account' opens registration", async () => {
    useAuth.mockReturnValue({ user: { isDemo: true } });
    render(<DemoBanner />, { wrapper: MemoryRouter });

    await userEvent.click(screen.getByRole("button", { name: /create a free account/i }));

    expect(navigateMock).toHaveBeenCalledWith("/register");
  });
});
