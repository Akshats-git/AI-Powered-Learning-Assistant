import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.join(__dirname, "fixtures", "sample.pdf");
const TOKEN_STORAGE_KEY = "ai-learning-assistant-token";

// Covers the two journeys that don't touch the LLM: register/login, and
// upload -> see it in the document list. AI features (chat, flashcards,
// quizzes, summaries) need a real OpenAI key and are out of scope here.
test("register, log out, log back in, and land on the dashboard", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel(/username/i).fill("E2E Tester");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  await page.getByRole("button", { name: /logout/i }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("password123");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
});

test("uploads a PDF and sees it appear in the document list", async ({ page, request }) => {
  const email = `e2e-upload-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel(/username/i).fill("E2E Uploader");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // A fresh account's dashboard also shows a "Go to Documents" empty-state
  // link, so `exact` is needed — otherwise a loose /documents/i match hits
  // both that and the sidebar nav link.
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);

  const title = `E2E Document ${Date.now()}`;
  await page.getByRole("button", { name: /upload document/i }).click();
  await page.getByLabel(/title/i).fill(title);
  await page.locator("#doc-file").setInputFiles(SAMPLE_PDF);
  await page.getByRole("button", { name: /^upload$/i }).click();

  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toBeVisible();

  // Clean up the uploaded file via the API directly — there's no delete
  // affordance in the document list UI yet.
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_STORAGE_KEY);
  await card.click();
  await expect(page).toHaveURL(/\/documents\/[^/]+$/);
  const documentId = page.url().split("/documents/")[1];
  const backendUrl = process.env.BACKEND_URL;
  const del = await request.delete(`${backendUrl}/api/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(del.ok()).toBeTruthy();
});
