// Minimal multi-page text PDF writer (no deps). Each page is Helvetica text with a
// valid xref table so pdf.js (used by pdf-parse) reads it cleanly.
import fs from "fs";

const WORDS = ("alpha river stone quiet marble lantern orchard velvet harbor timber copper meadow " +
  "signal anchor canyon ripple thistle garden pebble summit cobalt ember willow fabric glacier " +
  "harvest lattice monsoon nectar obsidian prairie quartz saffron tundra umber vessel walnut yarrow " +
  "zephyr basalt cedar dune fjord grove haze isle jasper kelp lagoon mesa nimbus oasis plume").split(" ");

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const wrap = (text, width = 88) => {
  const out = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > width) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
};

export const buildPdf = (pageTexts) => {
  const objs = [];
  const add = (body) => (objs.push(body), objs.length);
  const catalog = add(""); // 1
  const pages = add(""); // 2
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); // 3
  const kids = [];
  for (const text of pageTexts) {
    const lines = text.split("\n").flatMap((l) => (l.trim() ? wrap(l) : [""]));
    let y = 750;
    let stream = "BT /F1 11 Tf 14 TL 50 " + y + " Td\n";
    for (const l of lines) stream += `(${esc(l)}) Tj T*\n`;
    stream += "ET";
    const contentId = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`
    );
    kids.push(pageId);
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += String(o).padStart(10, "0") + " 00000 n \n";
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
};

// needles: { pageNumber: "sentence" }. Filler is seeded-random vocabulary so BM25/embedding
// noise is uniform across pages and only the needle page carries the distinctive terms.
export const makeDoc = (pageCount, needles, seed = 7) => {
  const r = rng(seed);
  const pages = [];
  for (let p = 1; p <= pageCount; p += 1) {
    const paras = [`Chapter ${p}`];
    for (let k = 0; k < 3; k += 1) {
      const n = 45;
      const ws = Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]);
      paras.push(ws.join(" ") + ".");
    }
    if (needles[p]) paras.splice(2, 0, needles[p]);
    pages.push(paras.join("\n"));
  }
  return buildPdf(pages);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const needles = {
    5: "The Krebs cycle takes place inside the mitochondrial matrix and produces NADH and FADH2 for the electron transport chain.",
    22: "Theorem 4.2 (Vandermonde bound) states that every bounded monotone sequence of real numbers converges to its supremum.",
    38: "The Treaty of Zanzibar was signed in 1890 and transferred Heligoland to Germany in exchange for colonial concessions.",
  };
  fs.writeFileSync(process.argv[2] || "doc40.pdf", makeDoc(40, needles));
}
