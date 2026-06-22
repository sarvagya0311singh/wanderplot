/**
 * Switchable LLM provider — Gemini or OpenAI.
 * Switch by changing ACTIVE_LLM in .env.local. No code changes required.
 *
 * callLLM(prompt, systemPrompt) — backward-compatible prose calls (itinerary routes)
 * callLLMStructured(opts)       — JSON-mode structured calls (destination generation)
 */
import { env } from '@/config/env.config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmResponse {
  text: string;
  model: string;
  provider: 'gemini' | 'openai';
}

export interface LlmStructuredOptions {
  prompt: string;
  systemPrompt?: string;
  /** Target temperature — lower for structured data (0.4), higher for prose (0.7). Default 0.7 */
  temperature?: number;
  /** Override the model for this call (e.g. use geminiFastModel) */
  model?: string;
  /** If true, enable Gemini JSON mode (responseMimeType: application/json). Default false. */
  jsonMode?: boolean;
  /** Abort if the call takes longer than this many ms. Default 60000. */
  timeoutMs?: number;
  /**
   * Per-call thinking-token budget override. Defaults to env.geminiThinkingBudget (0).
   * Use a small budget (e.g. 512) for quality-critical calls (itinerary) so the model
   * sanity-checks constraints; keep 0 for mechanical calls (geocoding, candidate gen).
   */
  thinkingBudget?: number;
}

// ─── Typed LLM error ──────────────────────────────────────────────────────────

export type LlmErrorKind =
  | 'quota'        // 429 RESOURCE_EXHAUSTED — all keys exhausted
  | 'timeout'      // exceeded timeoutMs
  | 'invalid_key'  // 400/403 API_KEY_INVALID / PERMISSION_DENIED
  | 'unavailable'  // 503 UNAVAILABLE / overloaded — retries exhausted
  | 'bad_request'  // 400 INVALID_ARGUMENT (e.g. bad model name / config)
  | 'empty'        // model returned no text (safety block / truncation)
  | 'unknown';

export class LlmError extends Error {
  kind: LlmErrorKind;
  status?: number;
  constructor(kind: LlmErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }
}

// ─── Gemini Provider (direct REST — no deprecated SDK) ─────────────────────────
//
// Why REST instead of @google/generative-ai:
//   • The SDK (v0.x) is deprecated and does NOT pass `thinkingConfig` through —
//     and disabling "thinking" is THE fix for the 30s timeouts (thinking models
//     burn ~1000+ hidden tokens and take ~30s; budget 0 → ~3-9s).
//   • REST gives us full control: thinking budget, key rotation, retry on
//     transient 503/429, and precise error classification.

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(
  prompt: string,
  systemPrompt?: string,
  opts?: Omit<LlmStructuredOptions, 'prompt' | 'systemPrompt'>
): Promise<LlmResponse> {
  const keys = env.geminiApiKeys.length > 0
    ? env.geminiApiKeys
    : (env.geminiApiKey ? [env.geminiApiKey] : []);
  if (keys.length === 0) {
    throw new LlmError('invalid_key', 'GEMINI_API_KEY is not set in .env.local');
  }

  const modelName = opts?.model ?? env.geminiModel;
  const temperature = opts?.temperature ?? 0.7;
  const jsonMode = opts?.jsonMode ?? false;
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const thinkingBudget = opts?.thinkingBudget ?? env.geminiThinkingBudget;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      // thinkingBudget 0 = thinking off (mechanical calls); a small budget (e.g. 512)
      // lets quality-critical calls sanity-check constraints. Bounded → no 30s timeouts.
      thinkingConfig: { thinkingBudget },
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const MAX_ATTEMPTS = Math.max(keys.length * 2, 4);
  let keyIdx = 0;
  let lastErr: LlmError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const apiKey = keys[keyIdx % keys.length];
    const url = `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = parts.map((p: any) => p?.text ?? '').join('').trim();
        if (!text) {
          const finish = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason;
          throw new LlmError('empty', `Gemini returned no text (finishReason: ${finish ?? 'unknown'})`);
        }
        return { text, model: modelName, provider: 'gemini' };
      }

      // Non-OK — classify
      const errBody = await res.json().catch(() => ({}));
      const status: string = errBody?.error?.status ?? '';
      const message: string = errBody?.error?.message ?? `HTTP ${res.status}`;

      if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
        lastErr = new LlmError('quota', `Quota exhausted on key #${(keyIdx % keys.length) + 1}: ${message}`, 429);
        keyIdx++; // rotate to the next key
        await sleep(400);
        continue;
      }
      if (res.status === 503 || res.status === 500 || status === 'UNAVAILABLE' || status === 'INTERNAL') {
        lastErr = new LlmError('unavailable', `Gemini transient error: ${message}`, res.status);
        await sleep(600 * (attempt + 1)); // backoff, same key
        continue;
      }
      if (res.status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/.test(status) || /API key not valid/i.test(message)) {
        throw new LlmError('invalid_key', `Gemini key rejected: ${message}`, res.status);
      }
      if (res.status === 404) {
        throw new LlmError('bad_request', `Model "${modelName}" not found or unavailable to this key: ${message}`, 404);
      }
      if (res.status === 400) {
        throw new LlmError('bad_request', `Gemini bad request: ${message}`, 400);
      }
      lastErr = new LlmError('unknown', `Gemini error (${res.status}): ${message}`, res.status);
      await sleep(400);
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof LlmError) {
        // Non-retryable kinds bubble up immediately
        if (err.kind === 'invalid_key' || err.kind === 'bad_request') throw err;
        lastErr = err;
        continue;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        lastErr = new LlmError('timeout', `Gemini call timed out after ${timeoutMs}ms`);
        await sleep(300);
        continue;
      }
      lastErr = new LlmError('unknown', err instanceof Error ? err.message : String(err));
    }
  }

  throw lastErr ?? new LlmError('unknown', 'Gemini call failed after retries');
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

async function callOpenAI(
  prompt: string,
  systemPrompt?: string,
  opts?: Omit<LlmStructuredOptions, 'prompt' | 'systemPrompt'>
): Promise<LlmResponse> {
  if (!env.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set in .env.local');
  }
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: env.openaiApiKey });

  const modelName = opts?.model ?? env.openaiModel;
  const temperature = opts?.temperature ?? 0.7;
  const jsonMode = opts?.jsonMode ?? false;

  const messages: { role: 'system' | 'user'; content: string }[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const completion = await client.chat.completions.create({
    model: modelName,
    messages,
    temperature,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  const text = completion.choices[0]?.message?.content ?? '';
  return { text, model: modelName, provider: 'openai' };
}

// ─── Unified Interface ────────────────────────────────────────────────────────

/**
 * Call the active LLM with a plain text prompt (prose mode).
 * Switch providers via ACTIVE_LLM env variable — no code changes needed.
 * Backward-compatible signature — itinerary routes use this.
 */
export async function callLLM(prompt: string, systemPrompt?: string): Promise<LlmResponse> {
  if (env.activeLlm === 'openai') {
    return callOpenAI(prompt, systemPrompt);
  }
  return callGemini(prompt, systemPrompt);
}

/**
 * Call the active LLM with structured options (JSON mode, temp, model override, timeout).
 * Used by the AI destination engine for generation + geocoding.
 */
export async function callLLMStructured(opts: LlmStructuredOptions): Promise<LlmResponse> {
  const { prompt, systemPrompt, ...rest } = opts;
  if (env.activeLlm === 'openai') {
    return callOpenAI(prompt, systemPrompt, rest);
  }
  return callGemini(prompt, systemPrompt, rest);
}

/**
 * Parse JSON from LLM output robustly.
 * LLMs often wrap JSON in markdown code fences — this strips them.
 * Keep this even in JSON mode as a defensive fallback.
 */
export function parseLlmJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

export const activeLlmLabel =
  env.activeLlm === 'openai'
    ? `OpenAI ${env.openaiModel}`
    : `Google ${env.geminiModel}`;
