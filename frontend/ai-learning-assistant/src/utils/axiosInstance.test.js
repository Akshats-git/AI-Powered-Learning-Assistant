import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import toast from "react-hot-toast";
import axiosInstance, { handleResponseError } from "./axiosInstance";
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("tries a silent refresh on a 401 from a protected route, then clears the token and redirects if it fails", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(new Error("refresh failed"));
    localStorage.setItem(TOKEN_STORAGE_KEY, "some-token");
    const error = {
      response: { status: 401, data: { error: { message: "Session expired" } } },
      config: { url: "/api/documents", headers: {} },
    };

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining("/api/auth/refresh"), null, {
      withCredentials: true,
    });
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.location.href).toBe("/login");
  });

  it("retries the original request with the new token when the silent refresh succeeds", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { token: "fresh-token" } });
    const retriedResponse = { data: { ok: true } };
    vi.spyOn(axiosInstance, "request").mockResolvedValue(retriedResponse);
    localStorage.setItem(TOKEN_STORAGE_KEY, "stale-token");
    const error = {
      response: { status: 401, data: { error: { message: "Session expired" } } },
      config: { url: "/api/documents", headers: {} },
    };

    await expect(handleResponseError(error)).resolves.toBe(retriedResponse);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("fresh-token");
    expect(axiosInstance.request).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }) })
    );
    expect(window.location.href).toBe("");
  });

  it("does not attempt a refresh or redirect on a 401 from the login endpoint itself", async () => {
    const postSpy = vi.spyOn(axios, "post");
    localStorage.setItem(TOKEN_STORAGE_KEY, "some-token");
    const error = {
      response: { status: 401, data: { error: { message: "Invalid email or password" } } },
      config: { url: "/api/auth/login" },
    };

    await expect(handleResponseError(error)).rejects.toBe(error);
    expect(postSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("some-token");
    expect(window.location.href).toBe("");
  });
});
