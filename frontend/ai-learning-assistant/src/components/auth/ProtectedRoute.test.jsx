import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "../../hooks/useAuth";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const renderAtDashboard = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <p>Secret dashboard</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("ProtectedRoute", () => {
  it("shows a loading state instead of the route while auth is resolving", () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    renderAtDashboard();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Secret dashboard")).not.toBeInTheDocument();
  });

  it("redirects to /login when there is no user", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderAtDashboard();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected content when a user is present", () => {
    useAuth.mockReturnValue({ user: { id: "u1" }, loading: false });
    renderAtDashboard();
    expect(screen.getByText("Secret dashboard")).toBeInTheDocument();
  });
});
