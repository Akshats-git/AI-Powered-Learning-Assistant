export const formatFileSize = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// "3 hours ago", "yesterday", "just now" — built-in Intl instead of the 60 kB moment.
export const timeAgo = (value, now = Date.now()) => {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (Math.abs(seconds) < 45) return "just now";
  const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) || ["minute", 60];
  return rtf.format(Math.round(seconds / size), unit);
};
