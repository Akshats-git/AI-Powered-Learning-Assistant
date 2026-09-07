import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";

export const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400);
      throw new Error("Username, email and password are required");
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(400);
      throw new Error("Email already in use");
    }

    const user = await User.create({ username, email, password });

    res.status(201).json({
      user,
      token: generateToken(user._id),
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error("Email and password are required");
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      res.status(401);
      throw new Error("Invalid email or password");
    }

    res.status(200).json({
      user,
      token: generateToken(user._id),
    });
  } catch (err) {
    next(err);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    res.status(200).json({ user: req.user });
  } catch (err) {
    next(err);
  }
};

export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400);
      throw new Error("Current and new password are required");
    }

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
