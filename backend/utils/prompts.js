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

// The retrieval counterparts to flashcardPrompt/quizPrompt/summaryPrompt/
// explainPrompt below, and to chatPrompt further down: used once a document
// has been chunked. Generation has no user question to retrieve against
// (unlike chat), so instead of hybrid search picking the most relevant
// chunks, utils/contextSelection.js samples chunks evenly across the whole
// document — coverage, not relevance — so a long document's back half is
// represented instead of silently cut off. The excerpts themselves (with
// page labels) come from utils/citations.js's buildRetrievedContext; these
// functions only own the instructions wrapped around them.

export const retrievalFlashcardPrompt = (context, count) => `You are an expert study assistant. Below are excerpts sampled across the whole document (not the raw document text) so you have coverage from the beginning, middle, and end even for a long document. Based on them, generate ${count} flashcards that test understanding of the key concepts.

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"flashcards": [{"question": "string", "answer": "string", "difficulty": "easy" | "medium" | "hard"}]}

Document excerpts:
"""
${context}
"""`;

export const retrievalQuizPrompt = (context, count) => `You are an expert exam writer. Below are excerpts sampled across the whole document (not the raw document text) so you have coverage from the beginning, middle, and end even for a long document. Based on them, generate ${count} multiple-choice quiz questions, each with exactly 4 options and one correct answer.

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"questions": [{"question": "string", "options": ["string", "string", "string", "string"], "correctAnswer": "string", "explanation": "string"}]}

Document excerpts:
"""
${context}
"""`;

export const retrievalSummaryPrompt = (context) => `Summarize the following document excerpts in clear, well-structured markdown (use headings and bullet points where useful). The excerpts were sampled across the whole document rather than including it in full, so mention in one closing line that the summary is based on a sampled excerpt of the document, not the complete text.

Document excerpts:
"""
${context}
"""`;

export const retrievalExplainPrompt = (context, concept) => `Using the following document excerpts as context, explain the concept "${concept}" in clear, well-structured markdown. The excerpts were sampled across the whole document rather than including it in full — if the concept isn't covered by them, say so explicitly and give a general explanation instead of guessing.

Document excerpts:
"""
${context}
"""`;

export const retrievalChatPrompt = (context, history, question) => {
  const historyText = (history || [])
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `You are a helpful study assistant answering a question about a document. Below are the excerpts retrieved as most relevant to this specific question — not the whole document, so other relevant parts may exist that you can't see here.

Answer using ONLY the excerpts below, in markdown. When a claim comes from a specific excerpt, cite its page in parentheses, e.g. "(p. 12)". If the excerpts don't contain the answer, say so explicitly instead of guessing — do not fall back on outside knowledge.

Retrieved excerpts:
"""
${context}
"""

Conversation so far:
${historyText || "(no prior messages)"}

User question: ${question}`;
};
