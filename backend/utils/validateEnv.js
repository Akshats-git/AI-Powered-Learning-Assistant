// Fail fast and loud at boot instead of discovering a missing secret only
// when the first request that needs it comes in.
const REQUIRED_VARS = ["MONGO_URI", "JWT_SECRET", "CLIENT_URL"];
// OPENAI_API_KEY: without it there's no shared fallback key — AI features
// only work for users who've saved their own key in Profile (still a valid
// deploy, just BYOK-only). ENCRYPTION_KEY: without it, a saved user API key
// is encrypted with a key derived from JWT_SECRET instead of its own secret
// — see utils/encryption.js.
const RECOMMENDED_VARS = ["OPENAI_API_KEY", "ENCRYPTION_KEY"];

export const validateEnv = (env = process.env) => {
  const missingRequired = REQUIRED_VARS.filter((key) => !env[key]);
  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingRequired.join(", ")}. Check your .env file against .env.example.`
    );
  }

  const missingRecommended = RECOMMENDED_VARS.filter((key) => !env[key]);
  return { missingRecommended };
};
