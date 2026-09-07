import { useState } from "react";
import toast from "react-hot-toast";
import { UploadCloud, FileText } from "lucide-react";

import Modal from "../ui/Modal";
import { uploadDocument } from "../../services/documentService";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const UploadModal = ({ onClose, onUploaded }) => {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const validateAndSetFile = (candidate) => {
    if (!candidate) return;
    if (candidate.type !== "application/pdf") {
      setError("Only PDF files are allowed");
      return;
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      setError("File must be 10MB or smaller");
      return;
    }
    setError("");
    setFile(candidate);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    validateAndSetFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!file) {
      setError("Please choose a PDF file");
      return;
    }

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await uploadDocument(formData, (evt) => {
        setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      toast.success("Document uploaded");
      onUploaded(res.data);
      onClose();
    } catch {
      // error toast handled by the axios response interceptor
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      title="Upload Document"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-dark hover:opacity-90 disabled:opacity-60"
          >
            {uploading ? `Uploading... ${progress}%` : "Upload"}
          </button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="doc-title" className="block text-sm font-medium text-gray-700 mb-1.5">
            Title
          </label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 - Photosynthesis"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">File</label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-6 text-center transition ${
              dragActive ? "border-primary bg-primary/5" : "border-gray-200"
            }`}
          >
            <input
              id="doc-file"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => validateAndSetFile(e.target.files?.[0])}
            />
            {file ? (
              <label htmlFor="doc-file" className="cursor-pointer flex flex-col items-center gap-2">
                <FileText className="w-6 h-6 text-primary" />
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                <span className="text-xs text-gray-400">Click to choose a different file</span>
              </label>
            ) : (
              <label htmlFor="doc-file" className="cursor-pointer flex flex-col items-center gap-2">
                <UploadCloud className="w-6 h-6 text-gray-400" />
                <span className="text-sm text-gray-600">Drag & drop or click to choose a PDF</span>
                <span className="text-xs text-gray-400">PDF up to 10MB</span>
              </label>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
      </form>
    </Modal>
  );
};

export default UploadModal;
