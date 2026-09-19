import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import app from "../app.js";
import { UPLOAD_DIR } from "../middlewares/uploadMiddleware.js";
import { createUserWithToken } from "./helpers.js";

const SAMPLE_PDF = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../e2e/tests/fixtures/sample.pdf");

describe("UPLOAD_DIR", () => {
  it("is the throwaway directory the test setup configured, not the real backend/uploads", () => {
    expect(UPLOAD_DIR).toBe(path.resolve(process.env.UPLOAD_DIR));
    expect(UPLOAD_DIR).not.toBe(path.join(process.cwd(), "uploads"));
  });

  it("is where uploads are written AND where /uploads/* is served from", async () => {
    const { token } = await createUserWithToken();
    const upload = await request(app).post("/api/documents/upload").set("Authorization", `Bearer ${token}`).field("title", "Served").attach("file", SAMPLE_PDF);
    expect(upload.status).toBe(201);
    expect(fs.existsSync(path.join(UPLOAD_DIR, upload.body.fileName))).toBe(true);

    const served = await request(app).get(upload.body.fileUrl);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/pdf/);
  });
});
