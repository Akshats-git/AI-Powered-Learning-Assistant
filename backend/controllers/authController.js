import User from "../models/User.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/generateToken.js";
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from "../utils/refreshCookie.js";
import { startRefreshFamily, rotateRefreshToken, revokeFamily } from "../utils/refreshTokenStore.js";
import { isAdminEmail } from "../utils/adminEmails.js";

const MAX_FAILED_ATTEMPTS = Number(process.env.ACCOUNT_LOCK_MAX_ATTEMPTS) || 5;
const LOCK_DURATION_MS = (Number(process.env.ACCOUNT_LOCK_MINUTES) || 15) * 60 * 1000;

// Starts a brand-new rotation family (utils/refreshTokenStore.js) — every
// login/register is the start of a chain of refresh tokens that reuse
// detection can later revoke as a unit.
const issueTokens = async (res, user) => {
  const { jti, familyId } = await startRefreshFamily(user._id);
  setRefreshCookie(res, generateRefreshToken(user._id, jti, familyId));
  return generateAccessToken(user._id);
};

// isAdmin is never stored — it's computed from ADMIN_EMAILS on every
// response so the frontend can show/hide the admin nav link without a
// separate "am I an admin" round trip.
const withIsAdmin = (user) => ({ ...user.toJSON(), isAdmin: isAdminEmail(user.email) });

export const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(400);
      throw new Error("Email already in use");
    }

    const user = await User.create({ username, email, password });

    res.status(201).json({
      user: withIsAdmin(user),
      token: await issueTokens(res, user),
    });
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

    res.status(200).json({
      user: withIsAdmin(user),
      token: await issueTokens(res, user),
    });
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
    res.status(200).json({ token: generateAccessToken(user._id) });
  } catch (err) {
    next(err);
  }
};

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
