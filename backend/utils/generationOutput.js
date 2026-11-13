// Model output is untrusted input. Before it is saved, every card/question is
// checked here: a quiz question whose correctAnswer isn't one of its options
// can never be answered correctly, and a card missing its answer is just broken.
// Bad items are dropped (not the whole generation); if nothing usable is left the
// caller gets a 502 it can show, instead of a 500 from a missing field.

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const noUsableOutput = (what) => {
  const err = new Error(`The AI response didn't contain any usable ${what}. Please try again.`);
  err.statusCode = 502;
  return err;
};

export const sanitizeFlashcards = (cards, difficulties) => {
  const valid = (Array.isArray(cards) ? cards : [])
    .map((c) => ({ question: clean(c?.question), answer: clean(c?.answer), difficulty: difficulties.includes(c?.difficulty) ? c.difficulty : "medium" }))
    .filter((c) => c.question && c.answer);
  if (valid.length === 0) throw noUsableOutput("flashcards");
  return valid;
};

// Models often return the answer as "b" / "B) Paris" / different casing; map those
// back onto the exact option string, since grading is an exact string comparison.
const resolveCorrectAnswer = (answer, options) => {
  const exact = options.find((o) => o === answer);
  if (exact) return exact;
  const lowered = options.filter((o) => o.toLowerCase() === answer.toLowerCase());
  if (lowered.length === 1) return lowered[0];
  const letter = answer.match(/^\(?([A-Da-d])[).:]?$/);
  if (letter && options[letter[1].toUpperCase().charCodeAt(0) - 65]) return options[letter[1].toUpperCase().charCodeAt(0) - 65];
  return null;
};

export const sanitizeQuestions = (questions, { concept = null } = {}) => {
  const valid = [];
  for (const q of Array.isArray(questions) ? questions : []) {
    const question = clean(q?.question);
    const options = [...new Set((Array.isArray(q?.options) ? q.options : []).map(clean).filter(Boolean))];
    const correctAnswer = resolveCorrectAnswer(clean(q?.correctAnswer), options);
    if (!question || options.length < 2 || !correctAnswer) continue;
    valid.push({
      question,
      options,
      correctAnswer,
      explanation: clean(q.explanation),
      // A concept quiz is *about* one concept: don't trust the model to echo it
      // back verbatim, or a paraphrase would fork the learner's mastery record.
      concept: concept || clean(q.concept) || null,
    });
  }
  if (valid.length === 0) throw noUsableOutput("quiz questions");
  return valid;
};
