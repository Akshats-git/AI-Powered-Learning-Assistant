import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import PublicRoute from "./PublicRoute";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const renderAtLogin = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <p>Login form</p>
            </PublicRoute>
          }
        />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("PublicRoute", () => {
  it("shows a loading state instead of the route while auth is resolving", () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    renderAtLogin();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
  });

  it("renders the public content when there is no logged-in user", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderAtLogin();
    expect(screen.getByText("Login form")).toBeInTheDocument();
  });

  it("redirects an already logged-in user to the dashboard", () => {
    useAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    renderAtLogin();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
