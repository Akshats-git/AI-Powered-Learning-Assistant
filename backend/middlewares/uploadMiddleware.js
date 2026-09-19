import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

// UPLOAD_DIR lets a deploy point at a mounted volume, and lets the test suites
// write somewhere disposable instead of leaving PDFs in the real uploads
// folder. Default stays ./uploads relative to where the server was started.
export const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), "uploads");

// Render/Railway wipe the filesystem on every deploy, so this directory
// won't exist on a fresh container until something creates it — without
// this, the first upload after a deploy fails with a raw ENOENT instead of
// a clean multer error.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});
