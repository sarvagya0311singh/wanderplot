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
  /** Abort if the call takes longer than this many ms. Default 15000. */
  timeoutMs?: number;
}

// ─── Gemini Provider ──────────────────────────────────────────────────────────

async function callGemini(
  prompt: string,
  systemPrompt?: string,
  opts?: Omit<LlmStructuredOptions, 'prompt' | 'systemPrompt'>
): Promise<LlmResponse> {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set in .env.local');
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(env.geminiApiKey);

  const modelName = opts?.model ?? env.geminiModel;
  const temperature = opts?.temperature ?? 0.7;
  const jsonMode = opts?.jsonMode ?? false;

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });

  const timeoutMs = opts?.timeoutMs ?? 45_000;

  const generatePromise = model.generateContent(prompt);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini call timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  const result = await Promise.race([generatePromise, timeoutPromise]);
  const text = result.response.text();

  return { text, model: modelName, provider: 'gemini' };
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
