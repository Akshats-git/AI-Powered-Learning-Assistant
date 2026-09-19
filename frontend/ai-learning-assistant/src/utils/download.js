// Saves a Blob the browser already has as a file, via a temporary <a download>.
export const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** The filename from a Content-Disposition header, or `fallback`. */
export const filenameFromDisposition = (header, fallback) => /filename="?([^";]+)"?/i.exec(header || "")?.[1] || fallback;
