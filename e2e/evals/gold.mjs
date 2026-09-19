// Deterministic gold set: 5 documents x 20 questions = 100.
//
// SYNTHETIC on purpose: the facts are invented (rare entity names, numbers) so a
// correct answer can only come from retrieval, never from a model's general
// knowledge — that is what makes the score attributable to the pipeline. It is
// NOT a substitute for questions written against real PDFs; to add those, put a
// PDF and a questions file in `evals/real/` (see README) — the runner scores
// them the same way.
import { makeDoc } from "../live/make-pdf.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const SYLLABLES = ["hal", "vor", "sen", "quil", "fea", "ther", "mon", "dra", "kel", "ru", "zan", "tib", "ora", "lend", "pex", "wyn", "cor", "bas", "ilk", "nem"];
const OBJECTS = ["reactor", "furnace", "pump", "turbine", "centrifuge"];
const UNITS = ["kelvin", "pascals", "hertz", "newtons", "volts"];
const QUANTITIES = ["temperature", "pressure", "frequency", "load", "voltage"];

const entity = (r) => {
  const w = () => SYLLABLES[Math.floor(r() * SYLLABLES.length)] + SYLLABLES[Math.floor(r() * SYLLABLES.length)];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  return cap(w() + w().slice(0, 3));
};

// Questions the document does NOT answer — a well-behaved system says so.
const UNANSWERABLE = [
  (e) => `What is the annual budget of the ${e} laboratory?`,
  (e) => `Which committee approved the ${e} protocol?`,
  (e) => `How many employees work on the ${e} project?`,
  (e) => `In which city was ${e} founded?`,
  (e) => `What is the warranty period for the ${e} unit?`,
];

/** @returns [{ id, title, pageCount, pdf: Buffer, questions: [{ id, category, question, answerPage, mustContain }] }] */
export const buildGoldSet = ({ seed = 20260919 } = {}) => {
  const docs = [];
  const pageCounts = [12, 20, 30, 45, 60];

  pageCounts.forEach((pageCount, d) => {
    const r = rng(seed + d * 101);
    const needles = {};
    const questions = [];
    const usedPages = new Set();
    const pickPage = () => {
      let p;
      do p = 1 + Math.floor(r() * pageCount);
      while (usedPages.has(p));
      usedPages.add(p);
      return p;
    };
    const usedNames = new Set();
    const uniqueEntity = () => {
      let e;
      do e = entity(r);
      while (usedNames.has(e));
      usedNames.add(e);
      return e;
    };

    // 5 per category x 3 answerable categories = 15 answerable, + 5 unanswerable.
    for (let i = 0; i < 5; i += 1) {
      const e = uniqueEntity();
      const o = OBJECTS[i % OBJECTS.length];
      const k = i % QUANTITIES.length;
      const n = 100 + Math.floor(r() * 900);
      const page = pickPage();
      needles[page] = `The ${e} ${o} operates at a ${QUANTITIES[k]} of ${n} ${UNITS[k]} during normal service.`;
      questions.push({ category: "numeric", question: `What ${QUANTITIES[k]} does the ${e} ${o} operate at?`, answerPage: page, mustContain: String(n) });
    }
    for (let i = 0; i < 5; i += 1) {
      const e = uniqueEntity();
      // No "Dr." — a period mid-name would split the fact into two sentences for naive extractors.
      const person = `Dr ${entity(r)}`;
      const year = 1900 + Math.floor(r() * 120);
      const page = pickPage();
      needles[page] = `${e} was first synthesized in ${year} by ${person} at the university laboratory.`;
      questions.push({ category: "who", question: `Who first synthesized ${e}?`, answerPage: page, mustContain: person });
      questions.push({ category: "when", question: `In what year was ${e} first synthesized?`, answerPage: page, mustContain: String(year), _sharesPage: true });
    }
    // trim to exactly 15 answerable: 5 numeric + 5 who + 5 when
    for (let i = 0; i < 5; i += 1) {
      const e = uniqueEntity();
      questions.push({ category: "unanswerable", question: UNANSWERABLE[i % UNANSWERABLE.length](e), answerPage: null, mustContain: null });
    }

    docs.push({
      id: `doc${d + 1}`,
      title: `Gold corpus ${d + 1} (${pageCount} pages)`,
      pageCount,
      pdf: makeDoc(pageCount, needles, seed + d),
      questions: questions.map((q, i) => ({ id: `doc${d + 1}-q${i + 1}`, ...q })),
    });
  });

  return docs;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const set = buildGoldSet();
  console.log(`${set.length} docs, ${set.reduce((a, d) => a + d.questions.length, 0)} questions`);
  console.log(set[0].questions.slice(0, 3));
}
