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

  it("is where uploads are written AND where the authenticated file endpoint reads from", async () => {
    const { token } = await createUserWithToken();
    const upload = await request(app).post("/api/documents/upload").set("Authorization", `Bearer ${token}`).field("title", "Served").attach("file", SAMPLE_PDF);
    expect(upload.status).toBe(201);
    expect(fs.existsSync(path.join(UPLOAD_DIR, upload.body.fileName))).toBe(true);

    const served = await request(app).get(upload.body.fileUrl).set("Authorization", `Bearer ${token}`);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toMatch(/pdf/);
    expect(served.headers["cache-control"]).toBe("private, no-store");
  });

  it("never serves a PDF without auth, to another user, or from the old public /uploads path", async () => {
    const owner = await createUserWithToken();
    const other = await createUserWithToken();
    const upload = await request(app).post("/api/documents/upload").set("Authorization", `Bearer ${owner.token}`).field("title", "Private").attach("file", SAMPLE_PDF);
    expect(upload.body.fileUrl).toBe(`/api/documents/${upload.body._id}/file`);

    expect((await request(app).get(upload.body.fileUrl)).status).toBe(401);
    expect((await request(app).get(upload.body.fileUrl).set("Authorization", `Bearer ${other.token}`)).status).toBe(404);
    expect((await request(app).get(`/uploads/${upload.body.fileName}`)).status).toBe(404);
  });

  it("404s with a clear message when the file was wiped from disk", async () => {
    const { token } = await createUserWithToken();
    const upload = await request(app).post("/api/documents/upload").set("Authorization", `Bearer ${token}`).field("title", "Gone").attach("file", SAMPLE_PDF);
    fs.unlinkSync(path.join(UPLOAD_DIR, upload.body.fileName));

    const res = await request(app).get(upload.body.fileUrl).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/no longer available/);
  });
});
