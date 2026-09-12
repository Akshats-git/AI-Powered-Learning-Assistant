import crypto from "crypto";

// Encrypts values at rest (a user's own OpenAI API key — see
// controllers/authController.js's updateApiKey) with AES-256-GCM: a random
// IV per encryption, and GCM's auth tag catches any tampering with the
// ciphertext instead of silently decrypting to garbage.
//
// The key is derived (scrypt) from ENCRYPTION_KEY so any passphrase-shaped
// string works as the env var, not just a raw 32-byte hex blob. Falling back
// to JWT_SECRET keeps `npm run dev` working with zero extra setup, but it
// means a stored key is only as protected as JWT_SECRET is — validateEnv.js
// warns at boot if ENCRYPTION_KEY isn't set explicitly, and production should
// always set its own.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SCRYPT_SALT = "ai-learning-assistant-encryption";

let cachedKey = null;

const getKey = () => {
  if (cachedKey) return cachedKey;
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Neither ENCRYPTION_KEY nor JWT_SECRET is set — cannot encrypt/decrypt stored secrets");
  }
  cachedKey = crypto.scryptSync(secret, SCRYPT_SALT, 32);
  return cachedKey;
};

// Exported only so tests can exercise a key change without restarting the
// process; production code never needs to call this.
export const _resetKeyCache = () => {
  cachedKey = null;
};

export const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // iv.ciphertext.authTag, each base64 — one string so the schema stays a
  // single `String` field rather than three columns for one logical secret.
  return [iv, ciphertext, authTag].map((buf) => buf.toString("base64")).join(".");
};

export const decrypt = (payload) => {
  const [ivB64, ciphertextB64, authTagB64] = String(payload).split(".");
  if (!ivB64 || !ciphertextB64 || !authTagB64) {
    throw new Error("Malformed encrypted payload");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
};
