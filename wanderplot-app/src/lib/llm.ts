/**
 * Switchable LLM provider — Gemini or OpenAI.
 * Switch by changing ACTIVE_LLM in .env.local.
 * No code changes required.
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

// ─── Gemini Provider ──────────────────────────────────────────────────────────

async function callGemini(prompt: string, systemPrompt?: string): Promise<LlmResponse> {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set in .env.local');
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(env.geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: env.geminiModel,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return { text, model: env.geminiModel, provider: 'gemini' };
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

async function callOpenAI(prompt: string, systemPrompt?: string): Promise<LlmResponse> {
  if (!env.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set in .env.local');
  }
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: env.openaiApiKey });

  const messages: { role: 'system' | 'user'; content: string }[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    messages,
    temperature: 0.7,
  });

  const text = completion.choices[0]?.message?.content ?? '';
  return { text, model: env.openaiModel, provider: 'openai' };
}

// ─── Unified Interface ────────────────────────────────────────────────────────

/**
 * Call the active LLM with a prompt.
 * Switch providers via ACTIVE_LLM env variable — no code changes needed.
 */
export async function callLLM(prompt: string, systemPrompt?: string): Promise<LlmResponse> {
  if (env.activeLlm === 'openai') {
    return callOpenAI(prompt, systemPrompt);
  }
  return callGemini(prompt, systemPrompt);
}

/**
 * Parse JSON from LLM output robustly.
 * LLMs often wrap JSON in markdown code fences — this strips them.
 */
export function parseLlmJson<T>(raw: string): T {
  // Strip markdown code fences
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
