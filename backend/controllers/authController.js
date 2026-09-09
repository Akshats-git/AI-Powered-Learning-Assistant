import User from "../models/User.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/generateToken.js";
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from "../utils/refreshCookie.js";
import { startRefreshFamily, rotateRefreshToken, revokeFamily, revokeAllForUser } from "../utils/refreshTokenStore.js";
import { isAdminEmail } from "../utils/adminEmails.js";
import { createResetToken, consumeResetToken } from "../utils/passwordResetStore.js";
import { createVerificationToken, consumeVerificationToken } from "../utils/emailVerificationStore.js";
import { sendMail } from "../utils/mailer.js";
import { issueCsrfToken, clearCsrfCookie, isCsrfTokenValid } from "../utils/csrf.js";

const MAX_FAILED_ATTEMPTS = Number(process.env.ACCOUNT_LOCK_MAX_ATTEMPTS) || 5;
const LOCK_DURATION_MS = (Number(process.env.ACCOUNT_LOCK_MINUTES) || 15) * 60 * 1000;

// Starts a brand-new rotation family (utils/refreshTokenStore.js) — every
// login/register is the start of a chain of refresh tokens that reuse
// detection can later revoke as a unit.
const issueTokens = async (res, user) => {
  const { jti, familyId } = await startRefreshFamily(user._id);
  setRefreshCookie(res, generateRefreshToken(user._id, jti, familyId));
  return { accessToken: generateAccessToken(user._id), csrfToken: issueCsrfToken(res) };
};

// isAdmin is never stored — it's computed from ADMIN_EMAILS on every
// response so the frontend can show/hide the admin nav link without a
// separate "am I an admin" round trip.
const withIsAdmin = (user) => ({ ...user.toJSON(), isAdmin: isAdminEmail(user.email) });

// Best-effort: registration succeeds either way. A failed send (or an
// unconfigured mail provider — see utils/mailer.js) just means the user
// verifies later via "resend verification email" instead of the initial link.
const sendVerificationEmail = async (user) => {
  const token = await createVerificationToken(user._id);
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: "Verify your email",
    text: `Welcome! Verify your email to finish setting up your account: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  });
};

export const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(400);
      throw new Error("Email already in use");
    }

    const user = await User.create({ username, email, password });
    await sendVerificationEmail(user);

    const { accessToken, csrfToken } = await issueTokens(res, user);
    res.status(201).json({ user: withIsAdmin(user), token: accessToken, csrfToken });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const invalidCredentials = () => {
      res.status(401);
      return new Error("Invalid email or password");
    };

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw invalidCredentials();
    }

    // Locked accounts fail the same way a wrong password does — a distinct
    // "account locked" response would itself leak which emails are
    // registered and under attack.
    const isLocked = user.lockUntil && user.lockUntil > new Date();
    const passwordMatches = !isLocked && (await user.comparePassword(password));

    if (!passwordMatches) {
      if (!isLocked) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
          user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
          user.failedLoginAttempts = 0;
        }
        await user.save();
      }
      throw invalidCredentials();
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    // The only moment a still-bcrypt-hashed password can be upgraded to
    // argon2id: the plaintext only ever exists in memory, right here, right
    // after it's just been verified. Setting `password` re-triggers the
    // model's pre-save hashing hook.
    if (user.needsPasswordRehash()) user.password = password;
    await user.save();

    const { accessToken, csrfToken } = await issueTokens(res, user);
    res.status(200).json({ user: withIsAdmin(user), token: accessToken, csrfToken });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const token = readRefreshCookie(req);
    if (!token) {
      res.status(401);
      throw new Error("Not authorized, no refresh token");
    }

    // CSRF check comes after "is there even a session," so a plain missing
    // cookie still reads as a clean 401 rather than a confusing 403 — but
    // before anything the presented refresh token can actually do, since
    // this is the one cookie-authenticated endpoint that mints new
    // credentials. See utils/csrf.js for why the header (not just the
    // cookie) is required.
    if (!isCsrfTokenValid(req)) {
      res.status(403);
      throw new Error("Invalid or missing CSRF token");
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      res.status(401);
      throw new Error("Not authorized, invalid refresh token");
    }

    if (decoded.type !== "refresh") {
      res.status(401);
      throw new Error("Not authorized, wrong token type");
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401);
      throw new Error("Not authorized, user not found");
    }

    // Rotate on every use, and check the server-side record for reuse
    // (utils/refreshTokenStore.js) — this is what a signature check alone
    // can never catch: whether *this exact token* was already exchanged for
    // a newer one. A replay revokes the whole family, not just this token —
    // once one token from a chain has been reused, none of them can be trusted.
    const rotation = await rotateRefreshToken(decoded.jti, user._id);
    if (!rotation.ok) {
      clearRefreshCookie(res);
      res.status(401);
      throw new Error(
        rotation.reason === "reused"
          ? "Refresh token reuse detected. All sessions on this account have been signed out — please log in again."
          : "Not authorized, invalid refresh token"
      );
    }

    setRefreshCookie(res, generateRefreshToken(user._id, rotation.jti, rotation.familyId));
    res.status(200).json({ token: generateAccessToken(user._id), csrfToken: issueCsrfToken(res) });
  } catch (err) {
    next(err);
  }
};

// Not CSRF-gated: a forged logout is a nuisance (it ends a session the
// attacker doesn't control the replacement of), not an account compromise —
// unlike /refresh, it can't be used to mint anything. Requiring the header
// here would only make an already-idempotent, low-consequence action harder
// to call from a plain <a>/fetch with no token in hand yet.
export const logout = async (req, res, next) => {
  try {
    const token = readRefreshCookie(req);
    if (token) {
      // Revoke server-side too, not just the browser cookie — otherwise a
      // refresh token copied out via XSS before logout would keep working
      // for up to its full 7-day life even after the user "logged out."
      try {
        const decoded = verifyRefreshToken(token);
        if (decoded.familyId) await revokeFamily(decoded.familyId);
      } catch {
        // Already invalid/expired — nothing to revoke.
      }
    }

    clearRefreshCookie(res);
    clearCsrfCookie(res);
    res.status(200).json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    res.status(200).json({ user: withIsAdmin(req.user) });
  } catch (err) {
    next(err);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    // Identical response whether or not the account exists — the same
    // anti-enumeration posture as login (see the comment there). Only send
    // mail, and only issue a token, when there's actually a user to reset.
    if (user) {
      const token = await createResetToken(user._id);
      const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
      await sendMail({
        to: user.email,
        subject: "Reset your password",
        text: `We received a request to reset your password.\n\nReset it here: ${resetUrl}\n\nThis link expires in 1 hour and can only be used once. If you didn't request this, you can ignore this email.`,
      });
    }

    res.status(200).json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    const userId = await consumeResetToken(token);
    const user = userId ? await User.findById(userId) : null;
    if (!user) {
      res.status(400);
      throw new Error("Invalid or expired reset link");
    }

    user.password = newPassword;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // A password reset should end every existing session, not just the
    // request that triggered it — otherwise a device an attacker was
    // already using stays logged in straight through the "fix."
    await revokeAllForUser(user._id);

    res.status(200).json({ message: "Password reset successfully. Please log in." });
  } catch (err) {
    next(err);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    const userId = await consumeVerificationToken(token);
    if (!userId) {
      res.status(400);
      throw new Error("Invalid or expired verification link");
    }

    await User.updateOne({ _id: userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });

    res.status(200).json({ message: "Email verified" });
  } catch (err) {
    next(err);
  }
};

export const resendVerification = async (req, res, next) => {
  try {
    if (req.user.emailVerifiedAt) {
      res.status(400);
      throw new Error("Email is already verified");
    }

    await sendVerificationEmail(req.user);

    res.status(200).json({ message: "Verification email sent" });
  } catch (err) {
    next(err);
  }
};

export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);

    if (!(await user.comparePassword(currentPassword))) {
      res.status(400);
      throw new Error("Current password is incorrect");
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
};
