import "dotenv/config";

import { connectDB } from "./config/db.js";
import app from "./app.js";
import { logger } from "./utils/logger.js";

await connectDB();

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  logger.info(`Server running on ${PORT}`);
});
