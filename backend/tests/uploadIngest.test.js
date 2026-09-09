import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import app from "../app.js";
import Chunk from "../models/Chunk.js";
import { createUserWithToken } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.join(__dirname, "../../e2e/tests/fixtures/sample.pdf");

// This is the regression test for the wiring itself — ingest.test.js already
// covers ingestDocument's own logic in isolation; this confirms
// uploadDocument actually calls it, on the real upload path, and that a
// missing OPENAI_API_KEY (true for every test run) degrades instead of
// breaking the upload.
describe("upload triggers ingestion", () => {
  it("chunks a real uploaded PDF and stores it as retrievable Chunk rows", async () => {
    const { token } = await createUserWithToken();

    const res = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Ingested Upload")
      .attach("file", SAMPLE_PDF);

    expect(res.status).toBe(201);

    const chunks = await Chunk.find({ document: res.body._id });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.user.toString() === res.body.user)).toBe(true);
  });

});
