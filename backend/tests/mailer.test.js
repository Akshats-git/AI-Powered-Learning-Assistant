import { describe, it, expect, vi, beforeEach } from "vitest";

describe("sendMail", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
  });

  it("logs instead of sending when RESEND_API_KEY is unset, and reports not delivered", async () => {
    const { sendMail } = await import("../utils/mailer.js");
    const result = await sendMail({ to: "a@example.com", subject: "Hi", text: "body" });
    expect(result).toEqual({ delivered: false });
  });

  it("posts to the Resend API when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });

    const { sendMail } = await import("../utils/mailer.js");
    const result = await sendMail({ to: "a@example.com", subject: "Hi", text: "body" });

    expect(result).toEqual({ delivered: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );

    fetchSpy.mockRestore();
  });

  it("reports not delivered when Resend rejects the request", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 422 });

    const { sendMail } = await import("../utils/mailer.js");
    const result = await sendMail({ to: "a@example.com", subject: "Hi", text: "body" });

    expect(result).toEqual({ delivered: false });
    fetchSpy.mockRestore();
  });
});
