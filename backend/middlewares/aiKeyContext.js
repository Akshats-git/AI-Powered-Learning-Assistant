import User from "../models/User.js";
import { decrypt } from "../utils/encryption.js";
import { runWithApiKey } from "../utils/aiContext.js";
import { logger } from "../utils/logger.js";

// Mount on any route that can reach OpenAI (chat/generate/upload-ingestion)
// — never globally, since decrypting a user's key is unnecessary work (and
// unnecessary exposure of the plaintext in memory) for routes that can't use
// it. Resolves "own key, or fall back to the deployer's shared one" exactly
// once per request, then runs the rest of the chain inside that context —
// see utils/aiContext.js for why this is an AsyncLocalStorage handoff
// instead of a parameter threaded through every function.
export const attachAiKeyContext = async (req, res, next) => {
  let apiKey = null;
  let keySource = null;

  // req.user.openaiApiKeyLast4 is already loaded by `protect` (it isn't
  // select:false) — cheap enough to use as a gate so users who've never set
  // a key skip the extra round trip to fetch+decrypt one that isn't there.
  if (req.user?.openaiApiKeyLast4) {
    try {
      const withKey = await User.findById(req.user._id).select("+openaiApiKeyEncrypted");
      if (withKey?.openaiApiKeyEncrypted) {
        apiKey = decrypt(withKey.openaiApiKeyEncrypted);
        keySource = "own";
      }
    } catch (err) {
      logger.error({ err: err.message, userId: req.user._id }, "Failed to decrypt stored OpenAI key — falling back to the shared key");
    }
  }

  if (!apiKey && process.env.OPENAI_API_KEY) {
    apiKey = process.env.OPENAI_API_KEY;
    keySource = "shared";
  }

  runWithApiKey({ apiKey, keySource }, next);
};
