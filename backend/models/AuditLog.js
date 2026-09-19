import mongoose from "mongoose";

// Append-only record of security-relevant events. Never holds secrets: no
// passwords, tokens or API keys — only who/what/when/where.
const auditLogSchema = new mongoose.Schema(
  {
    // Null when the actor isn't a known account (a failed login for an email that doesn't exist).
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    event: { type: String, required: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    requestId: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ event: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
