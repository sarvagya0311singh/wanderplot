/**
 * Typed environment config for WanderPlot.
 * All env variable access should go through this module.
 * To switch LLMs: change ACTIVE_LLM in .env.local — no code changes needed.
 *
 * NOTE on NextAuth secret:
 *   NextAuth v5 reads AUTH_SECRET automatically.
 *   We also support NEXTAUTH_SECRET for backwards compatibility.
 */

export const env = {
  // MongoDB (optional at startup — app falls back to local data if not set)
  mongodbUri: process.env.MONGODB_URI,

  // NextAuth — v5 uses AUTH_SECRET; we support both names
  // Set either AUTH_SECRET or NEXTAUTH_SECRET in .env.local
  authSecret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'wanderplot-dev-fallback-secret-change-in-production',

  nextauthUrl: process.env.NEXTAUTH_URL,

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,

  // LLM — "gemini" | "openai"
  activeLlm: (process.env.ACTIVE_LLM || 'gemini') as 'gemini' | 'openai',

  // Google Gemini
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-pro',

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
} as const;

/** Returns true if MongoDB URI is configured */
export function isDbConfigured(): boolean {
  return !!env.mongodbUri;
}

/** Returns true if Google OAuth is configured */
export function isGoogleAuthConfigured(): boolean {
  return !!env.googleClientId && !!env.googleClientSecret;
}

/** Returns true if the required keys for the active LLM are set */
export function isLlmConfigured(): boolean {
  if (env.activeLlm === 'gemini') return !!env.geminiApiKey;
  if (env.activeLlm === 'openai') return !!env.openaiApiKey;
  return false;
}
