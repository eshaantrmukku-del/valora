/**
 * Centralised, validated configuration. Every environment variable the server reads is declared here.
 * Secrets are never logged; `describeIntegrations()` only reports whether each one is set.
 */
import { z } from 'zod';

const flag = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));
const bool = flag(false);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1).default('postgres://valora:valora@localhost:5432/valora'),
  DATABASE_SSL: bool,
  /** Apply pending migrations when the web process starts. */
  MIGRATE_ON_START: bool,

  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  RUN_WORKER: flag(true),
  WORKER_POLL_MS: z.coerce.number().int().min(250).default(2000),

  // ---- AI ----
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  AI_TIMEOUT_MS: z.coerce.number().int().default(90_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  /** Per-user daily cap on AI calls (cost control). */
  AI_DAILY_CALL_LIMIT: z.coerce.number().int().min(1).default(200),

  // ---- Data providers ----
  PROPERTYDATA_API_KEY: z.string().optional(),
  PROPERTYDATA_BASE_URL: z.string().url().default('https://api.propertydata.co.uk'),
  /** Comma-separated PropertyData sourcing list IDs to search. */
  PROPERTYDATA_LISTS: z
    .string()
    .default('unmodernised-properties,reduced-properties,repossessed-properties,quick-sale-properties'),
  EPC_API_EMAIL: z.string().optional(),
  EPC_API_KEY: z.string().optional(),
  ENABLE_LAND_REGISTRY: flag(true),
  ENABLE_POSTCODES_IO: flag(true),
  ENABLE_PLANNING_DATA: flag(true),
  /** Test-only fixture listing provider. Refused in production. */
  ENABLE_FIXTURE_PROVIDER: bool,
  /** Test-only deterministic AI stub. Refused in production. */
  ENABLE_FAKE_AI: bool,
  /** Test-only: disable rate limiting. Refused in production. */
  DISABLE_RATE_LIMIT: bool,

  // ---- Email ----
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // ---- Uploads ----
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(25).default(10),
});

export type Config = z.infer<typeof EnvSchema> & { isProduction: boolean; isTest: boolean };

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration — ${issues}`);
  }
  const c = parsed.data;
  const isProduction = c.NODE_ENV === 'production';
  if (isProduction && (c.ENABLE_FIXTURE_PROVIDER || c.ENABLE_FAKE_AI || c.DISABLE_RATE_LIMIT)) {
    throw new Error(
      'ENABLE_FIXTURE_PROVIDER, ENABLE_FAKE_AI and DISABLE_RATE_LIMIT must never be enabled in production.',
    );
  }
  return { ...c, isProduction, isTest: c.NODE_ENV === 'test' };
}

export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

/** For tests: reset the cached configuration after mutating process.env. */
export function resetConfig() {
  cached = null;
}
