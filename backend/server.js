import "dotenv/config";

import { validateEnv } from "./utils/validateEnv.js";
import { connectDB } from "./config/db.js";
import app from "./app.js";
import { logger } from "./utils/logger.js";

let missingRecommended;
try {
  ({ missingRecommended } = validateEnv());
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}

if (missingRecommended.length > 0) {
  logger.warn(
    `Missing recommended environment variable(s): ${missingRecommended.join(", ")} — related features will fail until set.`
  );
}

await connectDB();

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  logger.info(`Server running on ${PORT}`);
});
