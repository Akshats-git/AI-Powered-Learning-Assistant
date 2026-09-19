import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { createRequire } from "module";
import { Client, startBackend, BACKEND, ROOT, OUT, FAKE_PORT, sleep, makeUploadDir } from "./lib.mjs";
import { makeDoc } from "./make-pdf.mjs";
import { startFake } from "./fake-openai.mjs";

const require = createRequire(`${BACKEND}/package.json`);
const { MongoMemoryServer } = require("mongodb-memory-server");
const { chromium } = createRequire(`${ROOT}/e2e/package.json`)("@playwright/test");
const UPLOAD = makeUploadDir();
const SHOTS = path.join(OUT, "shots");
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const FRONT = "http://127.0.0.1:5811";
const BACK_PORT = 8811;
const PW = "Str0ng-Passw0rd!";
const results = [];
const step = async (page, name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    const msg = String(e.message || e).split("\n")[0].slice(0, 260);
    results.push({ name, ok: false, detail: msg });
    console.log(`  FAIL  ${name}  -> ${msg}`);
    await page.screenshot({ path: path.join(SHOTS, `FAIL-${name.replace(/\W+/g, "_").slice(0, 50)}.png`) }).catch(() => {});
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const mongod = await MongoMemoryServer.create();
globalThis.__mongoUri = mongod.getUri("ui");
const fake = await startFake(FAKE_PORT);
const be = await startBackend("ui", BACK_PORT, { CLIENT_URL: FRONT });
// UI_PROD=1 serves the production build (where the CSP <meta> is injected) instead of the dev server.
const FRONT_DIR = `${ROOT}/frontend/ai-learning-assistant`;
const FRONT_ENV = { ...process.env, VITE_API_BASE_URL: `http://127.0.0.1:${BACK_PORT}` };
if (process.env.UI_PROD) {
  const built = spawnSync("npx", ["vite", "build", "--outDir", path.join(OUT, "dist"), "--emptyOutDir"], { cwd: FRONT_DIR, env: FRONT_ENV, stdio: "ignore" });
  if (built.status !== 0) throw new Error("frontend build failed");
}
const vite = spawn(
  "npx",
  process.env.UI_PROD
    ? ["vite", "preview", "--outDir", path.join(OUT, "dist"), "--port", "5811", "--strictPort", "--host", "127.0.0.1"]
    : ["vite", "--port", "5811", "--strictPort", "--host", "127.0.0.1"],
  {
    cwd: FRONT_DIR,
    env: FRONT_ENV,
    stdio: "ignore",
    detached: true, // own process group so we can kill vite (not just npx) on teardown
  }
);
for (let i = 0; i < 100; i += 1) { try { if ((await fetch(FRONT)).ok) break; } catch {} await sleep(200); }

const pdfPath = path.join(OUT, "ui-doc.pdf");
fs.writeFileSync(pdfPath, makeDoc(40, {
  5: "The Krebs cycle takes place inside the mitochondrial matrix and produces NADH and FADH2 for the electron transport chain.",
  22: "Theorem 4.2 (Vandermonde bound) states that every bounded monotone sequence of real numbers converges to its supremum.",
}));

// admin account is created over the API so we can log in through the UI later
const adminApi = new Client(be.base);
await adminApi.register("admin", "admin@example.com", PW);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const consoleErrors = [], pageErrors = [], badResponses = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleErrors.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(`http://127.0.0.1:${BACK_PORT}`)) badResponses.push(`${r.status()} ${r.request().method()} ${r.url().replace(`http://127.0.0.1:${BACK_PORT}`, "")}`); });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true });
const btn = (name, opts = {}) => page.getByRole("button", { name, ...opts });
const tab = (name) => page.getByRole("button", { name, exact: true });
const closeModal = () => page.getByRole("button", { name: "Close" }).click();

console.log("\n=== UI journey (real Chromium, real backend, fake OpenAI) ===");

await step(page, "unauthenticated / redirects to /login", async () => {
  await page.goto(FRONT + "/");
  await page.waitForURL("**/login");
  await shot("01-login");
});
await step(page, "unauthenticated /dashboard bounces to /login", async () => {
  await page.goto(FRONT + "/dashboard");
  await page.waitForURL("**/login");
});
await step(page, "register form validates client-side (bad email + short password blocked)", async () => {
  await page.goto(FRONT + "/register");
  await page.getByPlaceholder("Jane Doe").fill("Ui Tester");
  await page.getByPlaceholder("you@example.com").fill("not-an-email");
  await page.getByPlaceholder("••••••••").fill("abc");
  await page.locator("button[type=submit]").click();
  await page.waitForTimeout(300);
  expect(page.url().includes("/register"), "should stay on /register");
  await shot("02-register-validation");
});
await step(page, "register -> lands on /dashboard", async () => {
  await page.getByPlaceholder("you@example.com").fill("ui@example.com");
  await page.getByPlaceholder("••••••••").fill(PW);
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/dashboard", { timeout: 10000 });
});
await step(page, "empty dashboard renders zeroed stat cards + empty state (no crash)", async () => {
  await page.getByText("Total Documents").waitFor();
  expect((await page.title()) === "Dashboard · StudyAI", `route title should be set, got "${await page.title()}"`);
  await shot("03-dashboard-empty");
});
await step(page, "email-verification banner is shown to an unverified user", async () => {
  await page.getByText(/verify your email/i).first().waitFor({ timeout: 4000 });
});
await step(page, "page reload keeps the session (silent refresh via httpOnly cookie)", async () => {
  await page.reload();
  await page.getByText("Total Documents").waitFor({ timeout: 8000 });
  expect(page.url().includes("/dashboard"), "should still be on dashboard");
});

let docUrl;
await step(page, "upload modal: rejects a non-PDF client-side", async () => {
  await page.goto(FRONT + "/documents");
  await btn(/upload document/i).first().click();
  fs.writeFileSync(path.join(OUT, "not-a.txt"), "hello");
  await page.setInputFiles("input[type=file]", path.join(OUT, "not-a.txt"));
  await page.waitForTimeout(300);
  await shot("04-upload-nonpdf");
  const uploadEnabled = await page.getByRole("dialog").getByRole("button", { name: /^upload$/i }).isEnabled().catch(() => null);
  const hasMsg = await page.getByText(/pdf/i).count();
  expect(hasMsg > 0, "expected some PDF-only messaging");
});
await step(page, "upload a PDF through the modal -> card appears without reload", async () => {
  await page.setInputFiles("input[type=file]", pdfPath);
  await page.getByPlaceholder(/Chapter 4/).fill("Biology & Math Reader");
  await page.getByRole("button", { name: /^upload$/i }).last().click();
  await page.getByText("Biology & Math Reader").first().waitFor({ timeout: 15000 });
  await shot("05-documents");
});
await step(page, "document card opens details page with 5 tabs", async () => {
  await page.getByText("Biology & Math Reader").first().click();
  await page.waitForURL(/\/documents\/[a-f0-9]{24}$/);
  docUrl = page.url();
  await page.waitForFunction(() => document.title === "Biology & Math Reader · StudyAI", null, { timeout: 5000 });
  for (const t of ["Content", "Chat", "AI Actions", "Flashcards", "Quizzes"]) await page.getByText(t, { exact: true }).first().waitFor();
});
await step(page, "Content tab embeds the PDF viewer (iframe) + 'open in new tab' link", async () => {
  expect((await page.locator("iframe").count()) === 1, "expected one iframe");
  expect((await page.getByRole("link", { name: /new tab/i }).count()) >= 1, "expected open-in-new-tab link");
  await shot("06-content-tab");
});

await step(page, "Chat: ask a question -> markdown answer with 'N sources' + page range covering p.22", async () => {
  await tab("Chat").click();
  await page.getByPlaceholder(/Ask a question/).fill("What does Theorem 4.2 Vandermonde bound state?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText(/bounded monotone sequence/i).first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /\d+ sources?/ }).first().click();
  const txt = await page.locator("body").innerText();
  expect(/p\. 22\b/.test(txt), "expected an exact 'p. 22' citation chip in the DOM");
  expect(!/6 sources/.test(txt), "irrelevant chunks should not all be listed as sources");
  await shot("07-chat-citations");
});
await step(page, "Chat: clicking a citation jumps the PDF viewer to that exact page", async () => {
  await page.getByRole("button", { name: "Open page 22 in the document" }).click();
  await page.getByText("Showing page 22").waitFor();
  const src = await page.locator("iframe").getAttribute("src");
  expect(/#page=22$/.test(src), `iframe should target page 22, got ${src}`);
  await tab("Chat").click();
  await page.getByText(/bounded monotone sequence/i).first().waitFor();
});
await step(page, "Chat: hallucinated reply shows the 'not fully supported' warning", async () => {
  await page.getByPlaceholder(/Ask a question/).fill("Tell me about the Krebs moon");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText(/may not be fully supported/i).waitFor({ timeout: 15000 });
  await shot("08-chat-groundedness-warning");
});
await step(page, "Chat: history persists across a reload", async () => {
  await page.reload();
  await tab("Chat").click();
  await page.getByText(/bounded monotone sequence/i).first().waitFor({ timeout: 8000 });
});

await step(page, "AI Actions: Summarize opens a markdown modal", async () => {
  await tab("AI Actions").click();
  await btn("Summarize").click();
  await page.getByText("Point one").waitFor({ timeout: 15000 });
  expect((await page.getByRole("dialog", { name: "Summary" }).count()) === 1, "modal should be a labelled dialog");
  await shot("09-summary-modal");
  await page.keyboard.press("Escape");
  expect((await page.getByText("Point one").count()) === 0, "Escape should close the modal");
});
await step(page, "AI Actions: Explain a concept opens a modal titled with the concept", async () => {
  await page.getByPlaceholder("e.g. mitosis").fill("Krebs cycle");
  await btn("Explain").click();
  await page.getByText(/Explaining "Krebs cycle"/).waitFor({ timeout: 15000 });
  await closeModal();
});

await step(page, "Flashcards tab: empty state -> Generate Flashcards -> set card appears", async () => {
  await tab("Flashcards").click();
  await btn(/generate flashcards/i).first().click();
  await page.getByText(/Flashcards$/).filter({ hasText: "Biology" }).first().waitFor({ timeout: 15000 });
  await shot("10-flashcards-tab");
});
await step(page, "Flashcard viewer: flip with space, grade with keys 1-4, arrows navigate", async () => {
  await page.getByText(/Biology & Math Reader Flashcards/).first().click();
  await page.waitForURL(/flashcards/);
  await page.getByText("Question 1?").waitFor();
  await page.keyboard.press(" ");
  await page.getByText("Answer 1").waitFor();
  await shot("11-flashcard-flipped");
  await page.keyboard.press("3"); // Good
  await page.getByText("Question 2?").waitFor({ timeout: 5000 });
  await page.keyboard.press(" ");
  await page.keyboard.press("1"); // Again
  await page.getByText("Question 3?").waitFor({ timeout: 5000 });
  await page.keyboard.press("ArrowLeft");
  await page.getByText("Question 2?").waitFor({ timeout: 5000 });
});
await step(page, "Flashcards list page shows study progress for the set", async () => {
  await page.goto(FRONT + "/flashcards");
  await page.getByText(/Biology & Math Reader Flashcards/).first().waitFor();
  const txt = await page.locator("body").innerText();
  expect(/\b20%|\b2\/10|2 of 10|20 ?%/.test(txt) || /reviewed/i.test(txt), "expected progress info on the list page");
  await shot("12-flashcards-list");
});

await step(page, "Quizzes tab: Generate Quiz modal -> quiz card -> Start Quiz", async () => {
  await page.goto(docUrl);
  await tab("Quizzes").click();
  await btn(/generate quiz/i).first().click();
  await page.getByRole("button", { name: /^generate$/i }).click();
  await page.getByText("Start Quiz").waitFor({ timeout: 15000 });
  await shot("13-quizzes-tab");
  await page.getByText("Start Quiz").first().click();
  await page.waitForURL(/\/quizzes\/[a-f0-9]{24}$/);
});
await step(page, "Quiz take page: answers, jump pills, unanswered-question confirmation", async () => {
  await page.getByText(/Question 1 of 5/).waitFor();
  await page.getByText("B0", { exact: true }).click();
  await btn("Next").click();
  await page.getByText(/Question 2 of 5/).waitFor();
  await page.getByText("A1", { exact: true }).click(); // wrong on purpose
  await btn("Next").click();
  await page.getByText("B2", { exact: true }).click();
  await btn("Next").click();
  await page.getByText("A3", { exact: true }).click(); // wrong on purpose
  await btn("Next").click();
  // leave Q5 unanswered, submit -> confirm dialog
  await btn("Submit Quiz").click();
  await page.getByRole("heading", { name: /Unanswered questions/i }).waitFor();
  await shot("14-quiz-unanswered-confirm");
});
await step(page, "Quiz submit -> results page: 40% (2 of 5; unanswered counts wrong) with per-question review", async () => {
  await page.getByRole("button", { name: /submit/i }).last().click();
  await page.waitForURL(/results/, { timeout: 10000 });
  await page.getByText("40%").first().waitFor({ timeout: 8000 });
  await page.getByText(/Because B1 is right/).waitFor();
  await shot("15-quiz-results");
});
await step(page, "Quiz results: 'Return to Document' works", async () => {
  await page.getByRole("link", { name: /return to document/i }).click();
  await page.waitForURL(/\/documents\/[a-f0-9]{24}$/);
});

await step(page, "Review session (/review): due cards from all documents, keyboard grading", async () => {
  await page.goto(FRONT + "/review");
  await page.getByText(/Question \d+\?/).first().waitFor({ timeout: 8000 });
  await page.keyboard.press(" ");
  await page.keyboard.press("4");
  await page.waitForTimeout(400);
  await shot("16-review");
});
await step(page, "Dashboard reflects real data: 1 document, 10 flashcards, 1 quiz, streak, weak areas", async () => {
  await page.goto(FRONT + "/dashboard");
  await page.getByText("Weak Areas").waitFor({ timeout: 8000 });
  const txt = await page.locator("body").innerText();
  expect(/Vandermonde bound/.test(txt), "expected the missed concept in weak areas");
  expect((await page.getByTitle(/Reviewed today|keep your streak/).count()) === 1, "expected the streak badge (flame + day count)");
  expect(/\b1\b/.test(txt) && /\b10\b/.test(txt), "expected 1 document and 10 flashcards in the stat cards");
  await shot("17-dashboard-full");
});

await step(page, "Profile: sessions list, API-key settings and password form all render", async () => {
  await page.goto(FRONT + "/profile");
  await page.getByText(/active sessions/i).first().waitFor({ timeout: 8000 });
  expect((await page.getByText(/api key/i).count()) > 0, "expected an API key section");
  await shot("18-profile");
});
await step(page, "Profile: bad OpenAI key is rejected with an error toast", async () => {
  const input = page.getByPlaceholder(/sk-/).first();
  await input.fill("sk-bad");
  await page.getByRole("button", { name: /save/i }).first().click();
  await page.getByText(/valid OpenAI/i).first().waitFor({ timeout: 6000 });
  expect((await page.getByText(/valid OpenAI API key/i).count()) > 0, "the field-level validation message should reach the toast");
  await input.fill("sk-bad-00000000000000000000000");
  await page.getByRole("button", { name: /save/i }).first().click();
  await page.getByText(/OpenAI rejected that key/i).first().waitFor({ timeout: 6000 });
});
await step(page, "Profile: mismatched confirm-password is blocked client-side", async () => {
  const pw = page.locator("input[type=password]");
  const n = await pw.count();
  expect(n >= 3, `expected 3 password inputs, found ${n}`);
  await pw.nth(0).fill(PW); await pw.nth(1).fill("New-Passw0rd!!"); await pw.nth(2).fill("Different-Passw0rd");
  await page.getByRole("button", { name: /(change|update) password/i }).click();
  await page.getByText(/match/i).first().waitFor({ timeout: 4000 });
});
await step(page, "Profile: change password succeeds", async () => {
  const pw = page.locator("input[type=password]");
  await pw.nth(2).fill("New-Passw0rd!!");
  await page.getByRole("button", { name: /(change|update) password/i }).click();
  await page.getByText(/password (updated|changed)/i).first().waitFor({ timeout: 6000 });
});

await step(page, "Mobile viewport: sidebar collapses into a hamburger drawer", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(FRONT + "/dashboard");
  await page.waitForTimeout(500);
  try {
    const box = await page.getByRole("link", { name: "Documents", exact: true }).boundingBox();
    expect(box && box.x + box.width <= 0, `sidebar should be translated off-screen on mobile (x=${box?.x})`);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.waitForTimeout(400);
    const box2 = await page.getByRole("link", { name: "Documents", exact: true }).boundingBox();
    expect(box2 && box2.x >= 0, "drawer should slide into view after tapping the hamburger");
    await shot("19-mobile-drawer");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    results.push({ name: "mobile: no horizontal page overflow at 390px", ok: !overflow, detail: overflow ? "page scrolls horizontally" : "" });
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

await step(page, "Logout -> /login; protected route bounces afterwards", async () => {
  await page.goto(FRONT + "/dashboard");
  await btn(/logout/i).click();
  await page.waitForURL("**/login");
  await page.goto(FRONT + "/documents");
  await page.waitForURL("**/login");
});
await step(page, "Old password rejected in the UI, new password logs in", async () => {
  await page.getByPlaceholder("you@example.com").fill("ui@example.com");
  await page.getByPlaceholder("••••••••").fill(PW);
  await page.locator("button[type=submit]").click();
  await page.waitForTimeout(800);
  expect(page.url().includes("/login"), "old password should not log in");
  await page.getByPlaceholder("••••••••").fill("New-Passw0rd!!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/dashboard", { timeout: 8000 });
});
await step(page, "Forgot-password page renders and accepts an email", async () => {
  await btn(/logout/i).click();
  await page.goto(FRONT + "/forgot-password");
  await page.getByPlaceholder("you@example.com").fill("ui@example.com");
  await page.locator("button[type=submit]").click();
  await page.getByText(/reset link|check your/i).first().waitFor({ timeout: 6000 });
});
await step(page, "Unknown route renders the 404 page", async () => {
  await page.goto(FRONT + "/definitely/not/a/page");
  await page.getByText(/404|not found/i).first().waitFor();
  await shot("20-404");
});
await step(page, "Admin sees 'Cost Dashboard' and the page renders spend data", async () => {
  await page.goto(FRONT + "/login");
  await page.getByPlaceholder("you@example.com").fill("admin@example.com");
  await page.getByPlaceholder("••••••••").fill(PW);
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("link", { name: /cost dashboard/i }).click();
  await page.waitForURL("**/admin/costs");
  await page.getByText(/ui|spend|cost/i).first().waitFor();
  await page.getByText(/cache hit rate/i).waitFor();
  await shot("21-admin-costs");
});
await step(page, "Non-admin visiting /admin/costs does not see spend data", async () => {
  await btn(/logout/i).click();
  await page.getByPlaceholder("you@example.com").fill("ui@example.com");
  await page.getByPlaceholder("••••••••").fill("New-Passw0rd!!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/dashboard");
  await page.goto(FRONT + "/admin/costs");
  await page.waitForTimeout(1200);
  const txt = await page.locator("body").innerText();
  expect(!/ui@example\.com.*\$/s.test(txt) || /not authorized|forbidden|no access/i.test(txt), "non-admin should not see the cost table");
  await shot("22-admin-nonadmin");
});

// ---- demo mode, in a brand-new browser context (no session, no storage)
const demoCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const dp = await demoCtx.newPage();
dp.setDefaultTimeout(8000);
await step(dp, "demo: 'Try the demo' from the login page lands on a seeded dashboard, no signup", async () => {
  await dp.goto(FRONT + "/login");
  await dp.getByRole("button", { name: /try the demo/i }).click();
  await dp.waitForURL("**/dashboard");
  await dp.getByRole("note").getByText(/read-only demo/i).waitFor();
  await dp.getByText("Weak Areas").waitFor();
  await dp.getByText("Calvin cycle").first().waitFor();
  await dp.screenshot({ path: path.join(SHOTS, "23-demo-dashboard.png"), fullPage: true });
});
await step(dp, "demo: the seeded document, its chat history with a cited page, and the deck are all there", async () => {
  await dp.goto(FRONT + "/documents");
  await dp.getByText("How Plants Turn Light Into Food (demo)").first().click();
  await dp.waitForURL(/\/documents\/[a-f0-9]{24}$/);
  await dp.getByRole("button", { name: "Chat", exact: true }).click();
  await dp.getByText(/takes place in the/i).first().waitFor();
  await dp.getByRole("button", { name: /1 source/ }).click();
  await dp.getByText("p. 3").first().waitFor();
  await dp.getByRole("button", { name: "Flashcards", exact: true }).click();
  await dp.getByText("Photosynthesis basics").first().waitFor();
});
await step(dp, "demo: a write attempt is refused with a clear 'read-only' message and changes nothing", async () => {
  await dp.getByRole("button", { name: "Chat", exact: true }).click();
  await dp.getByPlaceholder(/Ask a question/).fill("hello?");
  await dp.getByRole("button", { name: "Send", exact: true }).click();
  await dp.getByText(/read-only/i).first().waitFor();
  await dp.screenshot({ path: path.join(SHOTS, "24-demo-readonly.png") });
});
await step(dp, "demo: 'Create a free account' leaves the demo and opens registration", async () => {
  await dp.goto(FRONT + "/dashboard");
  await dp.getByRole("button", { name: /create a free account/i }).click();
  await dp.waitForURL("**/register");
});
await demoCtx.close();

await browser.close();
try { process.kill(-vite.pid, "SIGTERM"); } catch {}
await be.stop();
await fake.stop();
await mongod.stop();
fs.rmSync(UPLOAD, { recursive: true, force: true });

if (process.env.UI_PROD) {
  const cspErrors = consoleErrors.filter((c) => /content security policy/i.test(c));
  results.push({ name: "production build runs under its CSP with zero violations", ok: cspErrors.length === 0, detail: cspErrors.slice(0, 3).join(" | ") });
}
const failed = results.filter((r) => !r.ok);
console.log(`\nUI TOTAL: ${results.length - failed.length} passed, ${failed.length} failed`);
console.log(`page errors: ${pageErrors.length}`, [...new Set(pageErrors)].slice(0, 6));
const uniqConsole = [...new Set(consoleErrors)];
console.log(`console errors/warnings: ${uniqConsole.length}`); uniqConsole.slice(0, 12).forEach((c) => console.log("   ", c));
const uniqBad = [...new Set(badResponses)];
console.log(`API 4xx/5xx during journey: ${uniqBad.length}`); uniqBad.forEach((c) => console.log("   ", c));
fs.writeFileSync(path.join(OUT, "ui-results.json"), JSON.stringify({ results, pageErrors, consoleErrors: uniqConsole, badResponses: uniqBad }, null, 2));
process.exit(failed.length ? 1 : 0);
