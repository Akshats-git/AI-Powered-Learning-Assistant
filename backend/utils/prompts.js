// A hard `slice(0, N)` has two problems: it cuts mid-sentence, and the model
// is never told anything was cut — it answers about the missing back half of
// the document exactly as confidently as the part it actually saw. This is a
// stopgap for the real fix (chunked retrieval, Arc A / Phase 25); until that
// lands, raise the ceiling well above the old 12K, cut on a paragraph/word
// boundary instead of mid-token, and tell the model explicitly when it's
// looking at a partial document so it can say "not covered" instead of
// guessing.
const MAX_TEXT_CHARS = Number(process.env.MAX_DOCUMENT_CHARS) || 60000;

const truncate = (text) => {
  const full = text || "";
  if (full.length <= MAX_TEXT_CHARS) {
    return { text: full, truncated: false };
  }

  // Prefer cutting at the last paragraph break, falling back to the last
  // whitespace, so we don't slice a word (or a number, or a citation) in half.
  const window = full.slice(0, MAX_TEXT_CHARS);
  const lastBreak = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
  const cut = lastBreak > MAX_TEXT_CHARS * 0.5 ? lastBreak : MAX_TEXT_CHARS;

  return { text: window.slice(0, cut), truncated: true };
};

const withTruncationNotice = (text) => {
  const { text: body, truncated } = truncate(text);
  if (!truncated) return body;

  return `${body}

[NOTE: this document is longer than the excerpt above; the rest was cut for length. If the question might be answered by a section you can't see here, say so explicitly instead of guessing.]`;
};

export const flashcardPrompt = (text, count) => `You are an expert study assistant. Based on the following document content, generate ${count} flashcards that test understanding of the key concepts.

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"flashcards": [{"question": "string", "answer": "string", "difficulty": "easy" | "medium" | "hard"}]}

Document content:
"""
${withTruncationNotice(text)}
"""`;

export const quizPrompt = (text, count) => `You are an expert exam writer. Based on the following document content, generate ${count} multiple-choice quiz questions, each with exactly 4 options and one correct answer.

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"questions": [{"question": "string", "options": ["string", "string", "string", "string"], "correctAnswer": "string", "explanation": "string"}]}

Document content:
"""
${withTruncationNotice(text)}
"""`;

export const summaryPrompt = (text) => `Summarize the following document in clear, well-structured markdown (use headings and bullet points where useful). If the document was cut short, mention in one closing line that the summary only covers the excerpt shown.

Document content:
"""
${withTruncationNotice(text)}
"""`;

export const explainPrompt = (text, concept) => `Using the following document as context, explain the concept "${concept}" in clear, well-structured markdown. If the concept is not covered by the document (or not covered by the excerpt shown, if it was cut short), say so and give a general explanation instead.

Document content:
"""
${withTruncationNotice(text)}
"""`;

export const chatPrompt = (text, history, question) => {
  const historyText = (history || [])
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `You are a helpful study assistant answering questions about the following document. Answer in markdown.

Document content:
"""
${withTruncationNotice(text)}
"""

Conversation so far:
${historyText || "(no prior messages)"}

User question: ${question}`;
};
