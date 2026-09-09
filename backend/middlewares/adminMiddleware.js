import { isAdminEmail } from "../utils/adminEmails.js";

// Must run after `protect` — relies on req.user being populated.
export const requireAdmin = (req, res, next) => {
  if (!isAdminEmail(req.user.email)) {
    res.status(403);
    return next(new Error("Admin access required"));
  }
  next();
};
