const MAX_TEXT_CHARS = 12000;

const truncate = (text) => (text || "").slice(0, MAX_TEXT_CHARS);

export const flashcardPrompt = (text, count) => `You are an expert study assistant. Based on the following document content, generate ${count} flashcards that test understanding of the key concepts.

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"flashcards": [{"question": "string", "answer": "string", "difficulty": "easy" | "medium" | "hard"}]}

Document content:
"""
${truncate(text)}
"""`;

export const quizPrompt = (text, count) => `You are an expert exam writer. Based on the following document content, generate ${count} multiple-choice quiz questions, each with exactly 4 options and one correct answer.

Respond with ONLY valid JSON in this exact shape, no markdown fences, no extra text:
{"questions": [{"question": "string", "options": ["string", "string", "string", "string"], "correctAnswer": "string", "explanation": "string"}]}

Document content:
"""
${truncate(text)}
"""`;

export const summaryPrompt = (text) => `Summarize the following document in clear, well-structured markdown (use headings and bullet points where useful).

Document content:
"""
${truncate(text)}
"""`;

export const explainPrompt = (text, concept) => `Using the following document as context, explain the concept "${concept}" in clear, well-structured markdown. If the concept is not covered by the document, say so and give a general explanation instead.

Document content:
"""
${truncate(text)}
"""`;

export const chatPrompt = (text, history, question) => {
  const historyText = (history || [])
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `You are a helpful study assistant answering questions about the following document. Answer in markdown.

Document content:
"""
${truncate(text)}
"""

Conversation so far:
${historyText || "(no prior messages)"}

User question: ${question}`;
};
