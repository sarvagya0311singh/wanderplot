/**
 * Typed environment config for WanderPlot.
 * All env variable access goes through this module.
 * Switch LLMs: change ACTIVE_LLM in .env.local — no code changes needed.
 *
 * NOTE on NextAuth secret:
 *   NextAuth v5 reads AUTH_SECRET automatically.
 *   We also support NEXTAUTH_SECRET for backwards compatibility.
 */

export const env = {
  // ─── MongoDB (optional — app falls back to static 30 if not set) ────────────
  mongodbUri: process.env.MONGODB_URI,

  // ─── NextAuth ────────────────────────────────────────────────────────────────
  authSecret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'wanderplot-dev-fallback-secret-change-in-production',
  nextauthUrl: process.env.NEXTAUTH_URL,

  // ─── Google OAuth ────────────────────────────────────────────────────────────
  googleClientId:     process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,

  // ─── LLM — "gemini" | "openai" ──────────────────────────────────────────────
  activeLlm: (process.env.ACTIVE_LLM || 'gemini') as 'gemini' | 'openai',

  // ─── Google Gemini ───────────────────────────────────────────────────────────
  geminiApiKey: process.env.GEMINI_API_KEY,
  /** Accuracy-critical calls (itinerary prose, grounded enrichment) */
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
  /** High-frequency calls (geocoding, candidate generation). Defaults to geminiModel. */
  geminiFastModel: process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL || 'gemini-1.5-pro',

  // ─── OpenAI ──────────────────────────────────────────────────────────────────
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel:  process.env.OPENAI_MODEL || 'gpt-4o',

  // ─── Upstash Redis (serverless cache — optional) ─────────────────────────────
  upstashRedisRestUrl:   process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN,

  // ─── Google Places API (live ratings/photos only — never cache content) ──────
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,

  // ─── Admin secret (protects /api/admin/ingest/* routes) ──────────────────────
  adminSecret: process.env.ADMIN_SECRET,

  // ─── AI Destination Engine tuning ────────────────────────────────────────────
  /** Master switch — set to 'false' to disable live Gemini generation. */
  aiDestinationsEnabled: process.env.AI_DESTINATIONS_ENABLED !== 'false',
  /** How many candidates to ask Gemini for per query. */
  aiCandidateCount: parseInt(process.env.AI_CANDIDATE_COUNT || '8', 10),
  /** How many hours before a cached recommendation set expires (Redis + Mongo TTL). */
  recoCacheTtlHours: parseInt(process.env.RECO_CACHE_TTL_HOURS || '6', 10),
  /** Batch size for ingestion jobs. */
  ingestBatchSize: parseInt(process.env.INGEST_BATCH_SIZE || '50', 10),
} as const;

// ─── Feature helpers ──────────────────────────────────────────────────────────

/** Returns true if MongoDB URI is configured */
export function isDbConfigured(): boolean {
  return !!env.mongodbUri;
}

/** Returns true if Upstash Redis is configured */
export function isRedisConfigured(): boolean {
  return !!env.upstashRedisRestUrl && !!env.upstashRedisRestToken;
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

/**
 * Returns true when live AI destination generation is available:
 * - active LLM key is set
 * - AI_DESTINATIONS_ENABLED !== 'false'
 */
export function isAiGenerationEnabled(): boolean {
  return isLlmConfigured() && env.aiDestinationsEnabled;
}
