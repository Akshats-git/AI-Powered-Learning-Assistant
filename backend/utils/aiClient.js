import OpenAI from "openai";

let client;

const getClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
};

const stripJsonFences = (text) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

export const generate = async (prompt, { json = false } = {}) => {
  let content;
  try {
    const response = await getClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });
    content = response.choices[0]?.message?.content || "";
  } catch (err) {
    const wrapped = new Error(`AI generation failed: ${err.message}`);
    wrapped.statusCode = 502;
    throw wrapped;
  }

  if (!json) return content;

  try {
    return JSON.parse(stripJsonFences(content));
  } catch {
    const err = new Error("AI response was not valid JSON");
    err.statusCode = 502;
    throw err;
  }
};
