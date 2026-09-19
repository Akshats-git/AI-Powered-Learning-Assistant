import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
export const BACKEND = path.join(ROOT, "backend");
export const OUT = path.join(HERE, "out");
export const CLIENT_URL = "http://127.0.0.1:5611";
export const FAKE_PORT = 9911;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
// ---------- http client with a tiny cookie jar ----------
export class Client {
  constructor(base, ip) { this.base = base; this.cookies = {}; this.token = null; this.csrf = null; this.ip = ip; }
  async req(method, url, { json, form, headers = {}, auth = true, useCookies = true } = {}) {
    const h = { ...headers };
    if (auth && this.token) h.authorization = `Bearer ${this.token}`;
    if (useCookies && url.startsWith("/api/auth") && Object.keys(this.cookies).length)
      h.cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    let body;
    if (json !== undefined) { h["content-type"] = "application/json"; body = JSON.stringify(json); }
    if (form) body = form;
    const t0 = Date.now();
    const res = await fetch(this.base + url, { method, headers: h, body });
    const text = await res.text();
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i), value = pair.slice(i + 1);
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(c)) delete this.cookies[name];
      else this.cookies[name] = value;
    }
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, body: data, headers: res.headers, text, ms: Date.now() - t0, setCookie: res.headers.getSetCookie?.() || [] };
  }
  async login(email, password) {
    const r = await this.req("POST", "/api/auth/login", { json: { email, password }, auth: false });
    if (r.status === 200) { this.token = r.body.token; this.csrf = r.body.csrfToken; }
    return r;
  }
  async register(username, email, password) {
    const r = await this.req("POST", "/api/auth/register", { json: { username, email, password }, auth: false });
    if (r.status === 201) { this.token = r.body.token; this.csrf = r.body.csrfToken; }
    return r;
  }
  upload(title, buf, { filename = "doc.pdf", type = "application/pdf" } = {}) {
    const fd = new FormData();
    if (title !== null) fd.append("title", title);
    if (buf) fd.append("file", new Blob([buf], { type }), filename);
    return this.req("POST", "/api/documents/upload", { form: fd });
  }
}

// ---------- backend process management ----------
export const startBackend = async (name, port, extraEnv = {}) => {
  const logs = [];
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME,
    PORT: String(port), MONGO_URI: globalThis.__mongoUri, JWT_SECRET: "live-test-secret", JWT_EXPIRES_IN: "1h",
    CLIENT_URL, ENCRYPTION_KEY: "live-test-encryption-key",
    OPENAI_API_KEY: "sk-shared-fake", OPENAI_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/v1`,
    // The documented deploy configs (.env.example, render.yaml, docker-compose) all set
    // this — quiz routing must still work with it set.
    OPENAI_MODEL: "gpt-4o-mini", MONTHLY_AI_BUDGET_USD: "", ADMIN_EMAILS: "admin@example.com",
    UPLOAD_DIR: globalThis.__uploadDir,
    ...extraEnv,
  };
  const child = spawn("node", ["server.js"], { cwd: BACKEND, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => logs.push(strip(d.toString())));
  child.stderr.on("data", (d) => logs.push(strip(d.toString())));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    await sleep(200);
  }
  return { name, base, logs, log: () => logs.join(""), stop: () => new Promise((r) => { child.once("exit", r); child.kill("SIGTERM"); setTimeout(r, 3000); }) };
};

export const lastToken = (be, kind) => {
  const ms = [...be.log().matchAll(new RegExp(`${kind}\\?token=([A-Za-z0-9_-]+)`, "g"))];
  return ms.length ? ms[ms.length - 1][1] : null;
};


// A disposable upload directory per run, so nothing lands in the real backend/uploads.
export const makeUploadDir = () => {
  fs.mkdirSync(OUT, { recursive: true });
  globalThis.__uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "learning-assistant-live-"));
  return globalThis.__uploadDir;
};
