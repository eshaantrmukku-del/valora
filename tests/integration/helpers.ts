import type { FastifyInstance } from 'fastify';

export function setTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgres://valora:valora@localhost:5432/valora_test';
  process.env.ENABLE_FIXTURE_PROVIDER = 'true';
  process.env.ENABLE_FAKE_AI = 'false';
  process.env.ENABLE_POSTCODES_IO = 'false';
  process.env.ENABLE_LAND_REGISTRY = 'false';
  process.env.ENABLE_PLANNING_DATA = 'false';
  process.env.RUN_WORKER = 'false';
  process.env.DISABLE_RATE_LIMIT = 'true';
  process.env.LOG_LEVEL = 'silent';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.PROPERTYDATA_API_KEY;
}

export interface Client {
  cookie: string;
  req: (method: string, url: string, body?: unknown) => Promise<{ status: number; json: any }>;
}

let counter = 0;
export async function newUser(
  app: FastifyInstance,
  emailPrefix = 'user',
): Promise<Client & { email: string }> {
  const email = `${emailPrefix}${Date.now()}${counter++}@example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'x-valora-client': '1', 'content-type': 'application/json' },
    payload: { email, password: 'correct horse battery' },
  });
  if (res.statusCode !== 200) throw new Error(`register failed ${res.statusCode} ${res.body}`);
  const cookie = String(res.headers['set-cookie']).split(';')[0]!;
  const client: Client = {
    cookie,
    async req(method, url, body) {
      const r = await app.inject({
        method: method as 'GET',
        url,
        headers: {
          'x-valora-client': '1',
          cookie,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        payload: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
    },
  };
  return { ...client, email };
}
