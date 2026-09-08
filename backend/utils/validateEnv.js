// Fail fast and loud at boot instead of discovering a missing secret only
// when the first request that needs it comes in.
const REQUIRED_VARS = ["MONGO_URI", "JWT_SECRET", "CLIENT_URL"];
const RECOMMENDED_VARS = ["OPENAI_API_KEY"];

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
