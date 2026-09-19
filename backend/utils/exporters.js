// Serializers for "take my data with you": a flashcard deck as CSV or as
// Anki's text-import format, and a finished quiz as Markdown.

// AI-generated text ends up in spreadsheets, and a cell that starts with = + - @
// (or a tab/CR) is executed as a formula by Excel/Sheets — "=HYPERLINK(...)" in a
// flashcard answer would be a data-exfiltration vector. Prefix such cells with a
// single quote so they're treated as text. (OWASP "CSV injection".)
const neutralizeFormula = (value) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const csvCell = (value) => {
  const text = neutralizeFormula(String(value ?? ""));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const flashcardsToCsv = (cards) =>
  // ﻿: a BOM makes Excel read the file as UTF-8 instead of guessing (and mangling accents).
  "﻿" +
  [["question", "answer", "difficulty", "favorite"], ...cards.map((c) => [c.question, c.answer, c.difficulty, c.isFavorite ? "yes" : "no"])]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n") +
  "\r\n";

// Anki's "Import > text" format: one note per line, fields separated by TAB.
// Tabs/newlines inside a field would break the row, so they become spaces / <br>.
const ankiField = (value) => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");

export const flashcardsToAnki = (cards, deckName) =>
  [`#separator:tab`, `#html:true`, `#deck:${ankiField(deckName)}`, `#tags column:3`]
    .concat(cards.map((c) => [ankiField(c.question), ankiField(c.answer), `difficulty::${c.difficulty || "medium"}`].join("\t")))
    .join("\n") + "\n";

// A filename that's safe on every OS and in a Content-Disposition header.
export const safeFilename = (name, extension) => {
  const base = String(name || "export").normalize("NFKD").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "export";
  return `${base}.${extension}`;
};

export const quizResultsToMarkdown = ({ title, percentage, correct, total, questions }) => {
  const lines = [`# ${title}`, "", `**Score:** ${percentage}% (${correct} of ${total} correct)`, ""];
  questions.forEach((q, i) => {
    lines.push(`## ${i + 1}. ${q.question}`, "");
    for (const option of q.options) {
      const marks = [option === q.correctAnswer ? "✅ correct" : null, option === q.userAnswer && option !== q.correctAnswer ? "❌ your answer" : null, option === q.userAnswer && option === q.correctAnswer ? "(your answer)" : null].filter(Boolean);
      lines.push(`- ${option}${marks.length ? `  — ${marks.join(", ")}` : ""}`);
    }
    if (q.userAnswer == null) lines.push("", "_Not answered._");
    if (q.explanation) lines.push("", `> ${q.explanation}`);
    lines.push("");
  });
  return lines.join("\n");
};
