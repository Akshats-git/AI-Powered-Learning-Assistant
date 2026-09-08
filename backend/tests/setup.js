import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

// Must be set before any test file imports app.js — cors() and the JWT helpers
// read these from process.env at module-load time.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-secret-do-not-use-in-production";
process.env.JWT_EXPIRES_IN ||= "1h";
process.env.CLIENT_URL ||= "http://localhost:5173";

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
  await mongoose.disconnect();
  await mongod.stop();
});
