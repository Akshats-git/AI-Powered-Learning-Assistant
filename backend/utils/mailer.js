import { logger } from "./logger.js";

// Deliberately not nodemailer + SMTP config: Resend's send API is one POST
// with no new dependency (Node's built-in fetch), and it's the provider the
// roadmap already named for the due-cards digest. Unset RESEND_API_KEY is a
// supported state, not a misconfiguration — the email is logged instead of
// sent, so password reset / verification still work end-to-end locally and
// in tests without a real provider.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || "onboarding@resend.dev";

export const sendMail = async ({ to, subject, text, html }) => {
  if (!RESEND_API_KEY) {
    logger.info({ to, subject, text }, "RESEND_API_KEY not set — logging email instead of sending it");
    return { delivered: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, text, html: html || undefined }),
    });

    if (!res.ok) {
      logger.error({ status: res.status, to, subject }, "Resend rejected the email send");
      return { delivered: false };
    }

    return { delivered: true };
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to reach Resend");
    return { delivered: false };
  }
};
