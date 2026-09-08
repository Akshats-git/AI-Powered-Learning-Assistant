import { describe, it, expect } from "vitest";
import { validateEnv } from "../utils/validateEnv.js";

const FULL_ENV = {
  MONGO_URI: "mongodb://localhost/test",
  JWT_SECRET: "secret",
  CLIENT_URL: "http://localhost:5173",
  OPENAI_API_KEY: "sk-test",
};

describe("validateEnv", () => {
  it("passes and reports nothing missing when everything is set", () => {
    expect(validateEnv(FULL_ENV)).toEqual({ missingRecommended: [] });
  });

  it("throws listing every missing required variable", () => {
    const { JWT_SECRET, ...rest } = FULL_ENV;
    void JWT_SECRET;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it("does not throw when only a recommended variable is missing, but reports it", () => {
    const { OPENAI_API_KEY, ...rest } = FULL_ENV;
    void OPENAI_API_KEY;
    expect(validateEnv(rest)).toEqual({ missingRecommended: ["OPENAI_API_KEY"] });
  });
});
