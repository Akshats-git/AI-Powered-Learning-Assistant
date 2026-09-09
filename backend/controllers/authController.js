import User from "../models/User.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/generateToken.js";
import { setRefreshCookie, clearRefreshCookie, readRefreshCookie } from "../utils/refreshCookie.js";
import { isAdminEmail } from "../utils/adminEmails.js";

const MAX_FAILED_ATTEMPTS = Number(process.env.ACCOUNT_LOCK_MAX_ATTEMPTS) || 5;
const LOCK_DURATION_MS = (Number(process.env.ACCOUNT_LOCK_MINUTES) || 15) * 60 * 1000;

const issueTokens = (res, user) => {
  setRefreshCookie(res, generateRefreshToken(user._id));
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
      token: issueTokens(res, user),
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
    await user.save();

    res.status(200).json({
      user: withIsAdmin(user),
      token: issueTokens(res, user),
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

    // Rotate on every use: the cookie the client walks away with is always
    // fresh, which shrinks the window a stolen refresh token is useful for.
    res.status(200).json({ token: issueTokens(res, user) });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
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
