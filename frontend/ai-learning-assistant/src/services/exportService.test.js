import { describe, it, expect, vi, beforeEach } from "vitest";
import axiosInstance from "../utils/axiosInstance";
import * as download from "../utils/download";
import { downloadFlashcardSet } from "./flashcardService";
import { downloadQuiz } from "./quizService";

vi.mock("../utils/axiosInstance", () => ({ default: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(download, "saveBlob").mockImplementation(() => {});
});

describe("export downloads", () => {
  it("requests the deck as a blob in the chosen format and saves it under the server's filename", async () => {
    const blob = new Blob(["x"]);
    axiosInstance.get.mockResolvedValue({ data: blob, headers: { "content-disposition": 'attachment; filename="Deck.txt"' } });

    await downloadFlashcardSet("set1", "anki", "My deck");

    expect(axiosInstance.get).toHaveBeenCalledWith("/api/flashcards/set1/export", { params: { format: "anki" }, responseType: "blob" });
    expect(download.saveBlob).toHaveBeenCalledWith(blob, "Deck.txt");
  });

  it("falls back to a sensible filename when the server's header isn't readable", async () => {
    axiosInstance.get.mockResolvedValue({ data: new Blob(["x"]), headers: {} });
    await downloadFlashcardSet("set1", "csv", "My deck");
    expect(download.saveBlob).toHaveBeenCalledWith(expect.any(Blob), "My deck.csv");
  });

  it("downloads a finished quiz as Markdown", async () => {
    axiosInstance.get.mockResolvedValue({ data: new Blob(["# q"]), headers: {} });
    await downloadQuiz("q1", "Quiz One");
    expect(axiosInstance.get).toHaveBeenCalledWith("/api/quizzes/q1/export", { responseType: "blob" });
    expect(download.saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Quiz One.md");
  });
});
