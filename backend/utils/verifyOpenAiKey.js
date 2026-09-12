import OpenAI from "openai";

// A cheap, unbilled call (listing models costs no tokens) so saving a key
// in Profile fails immediately and clearly on a typo or a revoked key,
// instead of the user only finding out the next time they try to chat.
// Split into its own module so tests can mock it without hitting the real
// OpenAI API — see tests/apiKey.test.js.
export const verifyOpenAiKey = async (apiKey) => {
  await new OpenAI({ apiKey }).models.list();
};
