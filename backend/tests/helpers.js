import User from "../models/User.js";
import { generateToken } from "../utils/generateToken.js";

let counter = 0;

// Creates a real, saved user (so bcrypt hashing and toJSON stripping are
// exercised too) and a token for it, ready to drop into an Authorization header.
export const createUserWithToken = async (overrides = {}) => {
  counter += 1;
  const user = await User.create({
    username: overrides.username || `Test User ${counter}`,
    email: overrides.email || `user-${counter}@example.com`,
    password: overrides.password || "password123",
  });
  return { user, token: generateToken(user._id) };
};
