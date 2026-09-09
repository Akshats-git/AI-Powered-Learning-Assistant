import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401);
    return next(new Error("Not authorized, no token"));
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // A refresh token is signed with the same secret but carries type
    // "refresh" — reject it here so a leaked refresh token (which lives 7
    // days vs. the access token's 15 minutes) can't be used directly as an
    // API credential.
    if (decoded.type === "refresh") {
      res.status(401);
      return next(new Error("Not authorized, wrong token type"));
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      res.status(401);
      return next(new Error("Not authorized, user not found"));
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401);
    next(new Error("Not authorized, invalid token"));
  }
};
