import fs from "fs";
import os from "os";
import path from "path";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

// Must be set before any test file imports app.js — cors() and the JWT helpers
// read these from process.env at module-load time.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-secret-do-not-use-in-production";
process.env.JWT_ACCESS_EXPIRES_IN ||= "1h";
process.env.JWT_REFRESH_EXPIRES_IN ||= "7d";
process.env.CLIENT_URL ||= "http://localhost:5173";
// Uploads land in a throwaway directory, not the real backend/uploads — the
// suites used to leave a PDF behind in it on every run.
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-assistant-test-uploads-"));
process.env.UPLOAD_DIR = uploadDir;

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
  await mongoose.disconnect();
  await mongod.stop();
});
