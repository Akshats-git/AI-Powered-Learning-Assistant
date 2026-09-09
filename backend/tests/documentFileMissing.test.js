import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import { createUserWithToken } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.join(__dirname, "../../e2e/tests/fixtures/sample.pdf");

describe("fileMissing flag", () => {
  it("is false right after a real upload", async () => {
    const { token } = await createUserWithToken();

    const uploadRes = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Present File")
      .attach("file", SAMPLE_PDF);

    expect(uploadRes.body.fileMissing).toBe(false);

    const getRes = await request(app)
      .get(`/api/documents/${uploadRes.body._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.body.fileMissing).toBe(false);
  });

  it("is true when the Mongo record has outlived its file on disk (e.g. after a redeploy)", async () => {
    const { user, token } = await createUserWithToken();

    const document = await Document.create({
      user: user._id,
      title: "Wiped by redeploy",
      fileName: "gone.pdf",
      filePath: "/tmp/definitely-does-not-exist/gone.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      extractedText: "some content that survived because it's in Mongo",
      hasExtractedText: true,
    });

    const getRes = await request(app)
      .get(`/api/documents/${document._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.body.fileMissing).toBe(true);

    const listRes = await request(app).get("/api/documents").set("Authorization", `Bearer ${token}`);
    expect(listRes.body.items.find((d) => d._id === document._id.toString()).fileMissing).toBe(true);
  });
});
