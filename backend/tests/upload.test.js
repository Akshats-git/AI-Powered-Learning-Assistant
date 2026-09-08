import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import request from "supertest";
import app from "../app.js";
import Document from "../models/Document.js";
import { createUserWithToken } from "./helpers.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

describe("POST /api/documents/upload", () => {
  it("rejects a file whose content isn't actually a PDF, even with a spoofed mimetype", async () => {
    const { token } = await createUserWithToken();
    const before = await fs.readdir(UPLOADS_DIR);

    const res = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Fake PDF")
      .attach("file", Buffer.from("this is not a pdf, just text pretending to be one"), {
        filename: "fake.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not a valid PDF/i);
    expect(await Document.countDocuments({})).toBe(0);

    // and it shouldn't leave the spoofed file behind on disk
    const after = await fs.readdir(UPLOADS_DIR);
    expect(after).toEqual(before);
  });

  it("does not leave an orphaned file on disk when the title is missing", async () => {
    const { token } = await createUserWithToken();
    const before = await fs.readdir(UPLOADS_DIR);

    const res = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.4\n%mock pdf content"), {
        filename: "no-title.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    const after = await fs.readdir(UPLOADS_DIR);
    expect(after).toEqual(before);
  });
});
