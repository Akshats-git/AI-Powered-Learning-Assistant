import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { MongoMemoryServer } from "mongodb-memory-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend", "ai-learning-assistant");

// Unusual, fixed ports so this never collides with a `npm run dev` you might
// already have running on the default 8000/5173.
const BACKEND_PORT = 8491;
const FRONTEND_PORT = 5491;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

const children = [];

const spawnChild = (command, args, options) => {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.push(child);
  return child;
};

const waitForHttp = async (url, { timeoutMs = 30_000, intervalMs = 300 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url} to respond`);
};

const killAll = () => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
};

let mongod;
let exitCode = 1;

try {
  console.log("[e2e] starting in-memory MongoDB...");
  mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri("e2e");

  console.log(`[e2e] starting backend on ${BACKEND_URL}...`);
  spawnChild("node", ["server.js"], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      MONGO_URI: mongoUri,
      JWT_SECRET: "e2e-test-secret-do-not-use-in-production",
      JWT_EXPIRES_IN: "1h",
      CLIENT_URL: FRONTEND_URL,
      // Left unset on purpose: E2E only covers non-AI journeys (auth, upload,
      // document list), so the backend runs without an OpenAI key.
      OPENAI_API_KEY: "",
    },
  });
  await waitForHttp(`${BACKEND_URL}/health`);
  console.log("[e2e] backend is up");

  console.log(`[e2e] starting frontend on ${FRONTEND_URL}...`);
  spawnChild("npm", ["run", "dev", "--", "--port", String(FRONTEND_PORT), "--strictPort"], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      VITE_API_BASE_URL: BACKEND_URL,
    },
  });
  await waitForHttp(FRONTEND_URL);
  console.log("[e2e] frontend is up");

  console.log("[e2e] running Playwright tests...");
  const playwright = spawnChild("npx", ["playwright", "test"], {
    cwd: __dirname,
    env: { ...process.env, FRONTEND_URL, BACKEND_URL },
  });

  exitCode = await new Promise((resolve) => {
    playwright.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  console.log("[e2e] tearing down...");
  killAll();
  if (mongod) await mongod.stop();
}

process.exit(exitCode);
