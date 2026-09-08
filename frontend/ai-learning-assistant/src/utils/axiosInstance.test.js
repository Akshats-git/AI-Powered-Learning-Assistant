import { describe, it, expect, vi, beforeEach } from "vitest";
import toast from "react-hot-toast";
import { handleResponseError } from "./axiosInstance";
import { TOKEN_STORAGE_KEY } from "./constants";

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn() },
}));

describe("handleResponseError", () => {
  beforeEach(() => {
    localStorage.clear();
    toast.error.mockClear();
    // jsdom's window.location doesn't support assigning .href directly
    // (it logs a "not implemented: navigation" error), so stub it out.
    Object.defineProperty(window, "location", {
      value: { pathname: "/dashboard", href: "" },
      writable: true,
      configurable: true,
    });
  });

  it("reads the message from the typed {error: {message}} envelope", async () => {
    const error = {
      response: { status: 400, data: { error: { code: "VALIDATION_ERROR", message: "Title is required" } } },
      config: { url: "/api/documents/upload" },
    };

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(toast.error).toHaveBeenCalledWith("Title is required");
  });

  it("falls back to a generic message when the response has no envelope", async () => {
    const error = { message: "Network Error", config: { url: "/api/documents" } };
    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(toast.error).toHaveBeenCalledWith("Network Error");
  });

  it("clears the token and redirects to /login on a 401 from a protected route", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "some-token");
    const error = {
      response: { status: 401, data: { error: { message: "Session expired" } } },
      config: { url: "/api/documents" },
    };

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("does not clear the token or redirect on a 401 from the login endpoint itself", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "some-token");
    const error = {
      response: { status: 401, data: { error: { message: "Invalid email or password" } } },
      config: { url: "/api/auth/login" },
    };

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("some-token");
    expect(window.location.href).toBe("");
  });
});
