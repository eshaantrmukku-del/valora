/**
 * AI service layer — the only place that talks to a language model.
 *
 *  - Structured outputs are validated against Zod schemas (SDK `parse` + our own re-validation).
 *  - Timeouts, retries (SDK, 408/429/5xx) and a per-user daily call cap (cost control).
 *  - Server-side refusal fallback is enabled (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`).
 *  - The model never performs financial arithmetic and never receives secrets.
 *  - A deterministic stub (ENABLE_FAKE_AI, non-production only) lets automated tests run without a key.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { config } from '../config';
import { getDb, schema } from '../db/client';
import { AppError } from '../lib/errors';

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class AiNotConfiguredError extends AppError {
  constructor() {
    super('not_configured', 'AI is not configured. Set ANTHROPIC_API_KEY to enable this feature.');
  }
}

export function fakeAiEnabled(): boolean {
  const c = config();
  return c.ENABLE_FAKE_AI && !c.isProduction;
}

export function aiAvailable(): boolean {
  return Boolean(config().ANTHROPIC_API_KEY) || fakeAiEnabled();
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  const c = config();
  if (!c.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  client ??= new Anthropic({ apiKey: c.ANTHROPIC_API_KEY, timeout: c.AI_TIMEOUT_MS, maxRetries: c.AI_MAX_RETRIES });
  return client;
}

export function modelName(): string {
  return fakeAiEnabled() && !config().ANTHROPIC_API_KEY ? 'fake' : config().ANTHROPIC_MODEL;
}

export async function assertWithinBudget(userId: string | null) {
  if (!userId) return;
  const since = new Date(Date.now() - 86_400_000);
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.userId, userId), gt(schema.aiUsage.createdAt, since)));
  if ((row?.n ?? 0) >= config().AI_DAILY_CALL_LIMIT) {
    throw new AppError('rate_limited', 'You have reached today’s AI usage limit. Deterministic features keep working; AI features reset within 24 hours.');
  }
}

export async function recordUsage(userId: string | null, task: string, ok: boolean, usage?: { input_tokens?: number | null; output_tokens?: number | null }) {
  await getDb()
    .insert(schema.aiUsage)
    .values({ userId, task, model: modelName(), ok, inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null });
}

export function describeAiError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return 'The AI provider rejected the API key.';
  if (err instanceof Anthropic.RateLimitError) return 'The AI provider is rate limiting requests. Try again shortly.';
  if (err instanceof Anthropic.BadRequestError) return `The AI request was rejected: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'The AI provider timed out.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI provider.';
  if (err instanceof Anthropic.APIError) return `AI provider error (${err.status ?? 'unknown'}).`;
  return err instanceof Error ? err.message : 'Unknown AI error';
}

export interface StructuredRequest<T> {
  task: string;
  userId: string | null;
  system: string;
  content: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  /** Deterministic implementation used only when the fake AI is enabled (tests). */
  fake: () => T;
}

export async function structured<T>(req: StructuredRequest<T>): Promise<{ data: T; model: string }> {
  await assertWithinBudget(req.userId);
  if (!config().ANTHROPIC_API_KEY) {
    if (!fakeAiEnabled()) throw new AiNotConfiguredError();
    const data = req.schema.parse(req.fake());
    await recordUsage(req.userId, req.task, true);
    return { data, model: 'fake' };
  }
  try {
    const res = await anthropic().beta.messages.parse({
      model: config().ANTHROPIC_MODEL,
      max_tokens: req.maxTokens ?? 16_000,
      system: req.system,
      messages: [{ role: 'user', content: req.content }],
      output_config: { format: betaZodOutputFormat(req.schema), effort: req.effort ?? 'medium' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new AppError('upstream_failed', 'The AI model declined this request.');
    if (res.stop_reason === 'max_tokens') throw new AppError('upstream_failed', 'The AI response was cut off before completion.');
    if (res.parsed_output == null) throw new AppError('upstream_failed', 'The AI response did not match the expected structure.');
    const data = req.schema.parse(res.parsed_output);
    await recordUsage(req.userId, req.task, true, res.usage);
    return { data, model: res.model };
  } catch (err) {
    await recordUsage(req.userId, req.task, false);
    throw new AppError('upstream_failed', describeAiError(err));
  }
}
