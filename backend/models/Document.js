import mongoose from "mongoose";

const pageRangeSchema = new mongoose.Schema(
  {
    page: { type: Number, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    extractedText: { type: String, default: "" },
    hasExtractedText: { type: Boolean, default: false },
    pageCount: { type: Number, default: 0 },
    // Where each page starts and ends inside `extractedText`. Captured at
    // parse time because it is unrecoverable afterwards — once the PDF is one
    // flat string there is no way back to "this sentence was on page 42", and
    // page-level citations are the whole point of the retrieval pipeline.
    pageMap: { type: [pageRangeSchema], default: [] },
    lastAccessedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

documentSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Document", documentSchema);
