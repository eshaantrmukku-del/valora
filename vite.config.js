import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchListingMetadataServer } from './src/lib/fetchListing.js';
import { isUsableListingMeta } from './src/lib/listingParser.js';
import { searchListingsServer } from './src/lib/discover/searchListings.js';
import { classifyImagesServer } from './src/lib/engine/visionServer.js';

const ALLOWED_HOSTS = ['rightmove.co.uk', 'zoopla.co.uk', 'onthemarket.com'];
const IMAGE_HOST_ALLOW = [
  'rightmove.co.uk',
  'zoopla.co.uk',
  'onthemarket.com',
  'media.rightmove.co.uk',
  'lc.zoocdn.com',
  'lid.zoocdn.com',
  'images.ctfassets.net',
];

function hostAllowed(hostname, allowList) {
  const host = hostname.replace(/^www\./, '');
  return allowList.some((h) => host === h || host.endsWith(`.${h}`));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function listingApiMiddleware() {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/listing')) return next();

    const reqUrl = new URL(req.url, 'http://localhost');
    const listingUrl = reqUrl.searchParams.get('url');

    if (!listingUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing url parameter' }));
      return;
    }

    let parsed;
    try {
      parsed = new URL(listingUrl);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid URL' }));
      return;
    }

    const host = parsed.hostname.replace(/^www\./, '');
    if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unsupported listing host. Use Rightmove, Zoopla, or OnTheMarket.' }));
      return;
    }

    try {
      const data = await fetchListingMetadataServer(listingUrl);
      if (!isUsableListingMeta(data)) {
        res.statusCode = 422;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'Could not extract price or property details from this listing',
          data,
        }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(data));
    } catch (err) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: err.message || 'Fetch failed',
        details: err.details || undefined,
      }));
    }
  };
}

function searchApiMiddleware() {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/search')) return next();

    const reqUrl = new URL(req.url, 'http://localhost');
    const filters = {
      location: reqUrl.searchParams.get('location'),
      channel: reqUrl.searchParams.get('channel') || 'sale',
      maxPrice: reqUrl.searchParams.get('maxPrice')
        ? parseInt(reqUrl.searchParams.get('maxPrice'), 10)
        : null,
      minPrice: reqUrl.searchParams.get('minPrice')
        ? parseInt(reqUrl.searchParams.get('minPrice'), 10)
        : null,
      minBedrooms: reqUrl.searchParams.get('minBedrooms') != null
        ? parseInt(reqUrl.searchParams.get('minBedrooms'), 10)
        : null,
      propertyTypes: reqUrl.searchParams.get('propertyTypes') || null,
      keywords: reqUrl.searchParams.get('keywords') || null,
      index: reqUrl.searchParams.get('index')
        ? parseInt(reqUrl.searchParams.get('index'), 10)
        : 0,
    };

    try {
      const result = await searchListingsServer(filters);
      res.statusCode = result.ok ? 200 : 422;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: false,
        error: err.message || 'Search failed',
        cards: [],
        resultCount: 0,
      }));
    }
  };
}

function visionApiMiddleware() {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/vision')) return next();
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }

    try {
      const body = await readJsonBody(req);
      const images = Array.isArray(body.images) ? body.images : [];
      const result = await classifyImagesServer(images);
      res.statusCode = result.ok ? 200 : 422;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: false,
        error: err.message || 'Vision failed',
        rooms: {},
      }));
    }
  };
}

function imageProxyMiddleware() {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/image-proxy')) return next();

    const reqUrl = new URL(req.url, 'http://localhost');
    const target = reqUrl.searchParams.get('url');
    if (!target) {
      res.statusCode = 400;
      res.end('Missing url');
      return;
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      res.statusCode = 400;
      res.end('Invalid url');
      return;
    }

    if (!hostAllowed(parsed.hostname, IMAGE_HOST_ALLOW)) {
      res.statusCode = 403;
      res.end('Host not allowed');
      return;
    }

    try {
      const upstream = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: target.includes('zoopla') ? 'https://www.zoopla.co.uk/' : 'https://www.rightmove.co.uk/',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        res.end('Upstream error');
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(buf);
    } catch (err) {
      res.statusCode = 502;
      res.end(err.message || 'Proxy failed');
    }
  };
}

function listingApiPlugin() {
  return {
    name: 'valora-listing-api',
    config(_cfg, { mode }) {
      // Expose env keys to the Node middleware process
      const env = loadEnv(mode, process.cwd(), '');
      for (const k of ['OPENAI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_VISION_MODEL', 'GROQ_VISION_MODEL']) {
        if (env[k] && !process.env[k]) process.env[k] = env[k];
      }
    },
    configureServer(server) {
      server.middlewares.use(imageProxyMiddleware());
      server.middlewares.use(visionApiMiddleware());
      server.middlewares.use(searchApiMiddleware());
      server.middlewares.use(listingApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(imageProxyMiddleware());
      server.middlewares.use(visionApiMiddleware());
      server.middlewares.use(searchApiMiddleware());
      server.middlewares.use(listingApiMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), listingApiPlugin()],
  server: { port: 5173, open: true },
});
