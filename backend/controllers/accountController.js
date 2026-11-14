import User from "../models/User.js";
import { deleteAccountData, exportAccountData } from "../utils/accountData.js";
import { clearRefreshCookie } from "../utils/refreshCookie.js";
import { clearCsrfCookie } from "../utils/csrf.js";
import { recordAudit } from "../utils/audit.js";
import { logger } from "../utils/logger.js";

// DELETE /api/auth/account — irreversible, so it re-asks for the password: a stolen
// access token alone (15 minutes of validity) must not be enough to wipe an account.
export const deleteAccount = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(req.body.password))) {
      res.status(401);
      throw new Error("Incorrect password");
    }

    await deleteAccountData(user._id);
    logger.info({ userId: String(user._id) }, "Account deleted at the user's request");
    clearRefreshCookie(res);
    clearCsrfCookie(res);
    res.status(200).json({ message: "Account deleted" });
  } catch (err) {
    if (res.statusCode === 401) await recordAudit(req, "account_delete_failed", { userId: req.user._id }).catch(() => {});
    next(err);
  }
};

// GET /api/auth/export — a JSON download of everything held about the caller.
export const exportMyData = async (req, res, next) => {
  try {
    const data = await exportAccountData(req.user);
    res
      .status(200)
      .set("Content-Type", "application/json; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="studyai-export.json"')
      .send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
};
