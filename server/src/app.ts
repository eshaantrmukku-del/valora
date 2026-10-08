import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { resolveSession } from './auth/sessions';
import { config } from './config';
import { AppError } from './lib/errors';
import { authRoutes } from './routes/auth';
import { preferencesRoutes } from './routes/preferences';
import { briefRoutes } from './routes/briefs';
import { discoverRoutes } from './routes/discover';
import { propertyRoutes } from './routes/properties';
import { analysisRoutes } from './routes/analyses';
import { savedRoutes } from './routes/saved';
import { comparisonRoutes } from './routes/comparisons';
import { portfolioRoutes } from './routes/portfolio';
import { notificationRoutes } from './routes/notifications';
import { documentRoutes } from './routes/documents';
import { assistantRoutes } from './routes/assistant';
import { dashboardRoutes } from './routes/dashboard';
import { systemRoutes } from './routes/system';
import { areaRoutes } from './routes/area';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const c = config();
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: c.LOG_LEVEL,
            redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'], censor: '[redacted]' },
          },
    bodyLimit: 1_000_000,
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: c.isProduction ? [] : null,
      },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: c.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 } });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    // CSRF defence: state-changing API calls must carry a custom header, which cross-site forms cannot set
    // and which triggers a CORS preflight (never granted) for cross-site scripts. Cookies are SameSite=Lax too.
    if (!SAFE_METHODS.has(req.method) && req.headers['x-valora-client'] !== '1') {
      throw new AppError('forbidden', 'Missing client header.');
    }
    req.user = await resolveSession(req);
  });

  app.setErrorHandler((err: FastifyError | AppError | ZodError, req, reply) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, err.message);
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details ?? null } });
    }
    if (err instanceof ZodError) {
      return reply.status(422).send({
        error: { code: 'validation_failed', message: 'Some fields are invalid.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      });
    }
    const fe = err as FastifyError;
    if (fe.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests — please wait a moment.' } });
    if (fe.code === 'FST_REQ_FILE_TOO_LARGE' || fe.statusCode === 413)
      return reply.status(413).send({ error: { code: 'payload_too_large', message: `Files must be ${c.MAX_UPLOAD_MB} MB or smaller.` } });
    if (fe.statusCode && fe.statusCode < 500)
      return reply.status(fe.statusCode).send({ error: { code: 'bad_request', message: fe.message } });
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } });
  });

  for (const routes of [
    systemRoutes,
    authRoutes,
    preferencesRoutes,
    briefRoutes,
    discoverRoutes,
    propertyRoutes,
    analysisRoutes,
    savedRoutes,
    comparisonRoutes,
    portfolioRoutes,
    notificationRoutes,
    documentRoutes,
    assistantRoutes,
    dashboardRoutes,
    areaRoutes,
  ]) {
    await app.register(routes);
  }

  // Serve the built web app (production). In development Vite serves the UI and proxies /api.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = [path.resolve(process.cwd(), 'dist/web'), path.resolve(here, '../web')].find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (webDist) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } }));
  }

  return app;
}
