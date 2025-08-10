import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Cookie } from 'tough-cookie';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import net from 'net';
import {
  Scraper,
  SearchMode,
  getUserIdByScreenName,
  fetchLikedTweets,
} from './dist/node/esm/index.mjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const DATABASE_URL = process.env.DATABASE_URL;
const PROXY_URL = process.env.PROXY_URL;
const HTTP_PROXY_BRIDGE = process.env.HTTP_PROXY_BRIDGE || 'http://127.0.0.1:8118';
const API_KEY = process.env.API_KEY || process.env.X_API_KEY;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment');
}

// Quick TCP probe to validate an HTTP proxy bridge is reachable
function verifyHttpBridge(bridgeUrl) {
  try {
    const url = new URL(bridgeUrl);
    const host = url.hostname;
    const port = parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10);

    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeoutMs = 1500;

      const done = (ok) => {
        try { socket.destroy(); } catch {}
        resolve(ok);
      };

      socket.setTimeout(timeoutMs);
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host, () => done(true));
    });
  } catch {
    return Promise.resolve(false);
  }
}

// Apply proxy via environment if provided
if (PROXY_URL) {
  // Check if it's a SOCKS5 URL and show real proxy location
  if (PROXY_URL.startsWith('socks5://')) {
    const socksUrl = PROXY_URL.replace('socks5://', '');
    const parts = socksUrl.split(':');
    const host = parts[0];
    const port = parts[1];
    const username = parts[2] || null;
    const password = parts[3] || null;
    
    // Prefer a local HTTP bridge (Privoxy/gost) if available
    const httpProxyUrl = HTTP_PROXY_BRIDGE;
    process.env.HTTP_PROXY = httpProxyUrl;
    process.env.HTTPS_PROXY = httpProxyUrl;
    
    console.log(`🌐 Real SOCKS5 proxy: ${host}:${port}`);
    console.log(`   → HTTP proxy: ${httpProxyUrl}`);
    console.log(`   → Credentials: ${username ? '***' : 'none'}`);

    // Probe the HTTP bridge and warn if unreachable
    verifyHttpBridge(httpProxyUrl).then((ok) => {
      if (!ok) {
        console.warn(`⚠️  HTTP proxy bridge not reachable at ${httpProxyUrl}.`);
        console.warn('   Set up Privoxy (port 8118) or provide HTTP_PROXY_BRIDGE env to a working HTTP proxy.');
        console.warn('   Continuing without a working proxy may cause outbound requests to fail.');
      }
    });
  } else {
    // Regular HTTP proxy
    process.env.HTTP_PROXY = PROXY_URL;
    process.env.HTTPS_PROXY = PROXY_URL;
    console.log(`🌐 HTTP proxy enabled: ${PROXY_URL}`);
  }
} else {
  console.log('🌐 No proxy configured - using direct connection');
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Allow cross-origin requests (useful for web clients; harmless for native iOS)
// In production, prefer restricting origin(s) via env (e.g., ALLOWED_ORIGINS)
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS; // comma-separated
const allowedOrigins = allowedOriginsEnv
  ? allowedOriginsEnv.split(',').map((s) => s.trim()).filter(Boolean)
  : undefined;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || !allowedOrigins) return callback(null, true);
      return callback(null, allowedOrigins.includes(origin));
    },
    credentials: false,
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'api-session-secret',
  resave: false,
  saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  })
);

// DB
const pool = new Pool({ connectionString: DATABASE_URL });

// Cache scrapers per session key
const sessionKeyToScraper = new Map();

function parseCookieStringToCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return [];
  return cookieHeader
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && s.includes('='))
    .map((s) => Cookie.parse(s))
    .filter(Boolean);
}

async function getAllSessionsFromDb(limit = 50) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT 
         id, 
         auth_token_cookie AS auth_token,
         user_agent,
         cookies AS cookies_json,
         raw_cookie_header AS cookie_string,
         created_at,
         COALESCE(updated_at, created_at) AS updated_at
       FROM x_sessions 
       ORDER BY COALESCE(updated_at, created_at) DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  } finally {
    client.release();
  }
}

async function getSessionFromDb({ id, authToken } = {}) {
  const client = await pool.connect();
  try {
    if (id != null) {
      const { rows } = await client.query(
        `SELECT 
           id, 
           auth_token_cookie AS auth_token,
           user_agent,
           cookies AS cookies_json,
           raw_cookie_header AS cookie_string,
           created_at,
           COALESCE(updated_at, created_at) AS updated_at
         FROM x_sessions WHERE id = $1 LIMIT 1`,
        [id]
      );
      return rows[0] || null;
    }
    if (authToken) {
      const { rows } = await client.query(
        `SELECT 
           id, 
           auth_token_cookie AS auth_token,
           user_agent,
           cookies AS cookies_json,
           raw_cookie_header AS cookie_string,
           created_at,
           COALESCE(updated_at, created_at) AS updated_at
         FROM x_sessions WHERE auth_token_cookie = $1 
         ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1`,
        [authToken]
      );
      return rows[0] || null;
    }
    const { rows } = await client.query(
      `SELECT 
         id, 
         auth_token_cookie AS auth_token,
         user_agent,
         cookies AS cookies_json,
         raw_cookie_header AS cookie_string,
         created_at,
         COALESCE(updated_at, created_at) AS updated_at
       FROM x_sessions 
       ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1`
    );
    return rows[0] || null;
  } finally {
    client.release();
  }
}

async function getScraperForRequest(req) {
  const sessionId = req.params.sessionId
    ? String(req.params.sessionId)
    : req.query.session_id
    ? String(req.query.session_id)
    : null;
  const authToken = req.query.auth_token ? String(req.query.auth_token) : null;

  const cacheKey = sessionId || authToken || 'latest';
  if (sessionKeyToScraper.has(cacheKey)) {
    return sessionKeyToScraper.get(cacheKey);
  }

  const dbSession = await getSessionFromDb({ id: sessionId, authToken });
  if (!dbSession) {
    return null;
  }

  const scraper = new Scraper();
  const cookieHeader = dbSession.cookie_string || '';
  const cookieObjects = parseCookieStringToCookies(cookieHeader);
  if (cookieObjects.length === 0) {
    return null;
  }
  await scraper.setCookies(cookieObjects);

  sessionKeyToScraper.set(cacheKey, scraper);
  return scraper;
}

// Simple API key middleware for all /api routes
function requireApiKey(req, res, next) {
  // If no API key configured, allow all (useful for local/dev)
  if (!API_KEY) return next();
  const headerKey = req.header('x-api-key') || req.header('X-API-Key');
  const queryKey = req.query.api_key ? String(req.query.api_key) : null;
  if (headerKey === API_KEY || queryKey === API_KEY) return next();
  return res.status(401).json({ success: false, message: 'Invalid API key' });
}

function requireScraper(handler) {
  return async (req, res) => {
    try {
      const scraper = await getScraperForRequest(req);
      if (!scraper) {
        return res.status(401).json({ success: false, message: 'No valid session available' });
      }
      return handler(req, res, scraper);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message || 'Unknown error' });
    }
  };
}

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Apply API key protection to all API endpoints
app.use('/api', requireApiKey);

// Accounts list (with minimal profile)
app.get('/api/accounts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sessions = await getAllSessionsFromDb(limit);

    // Hydrate with profile info (sequential to avoid rate/race)
    const results = [];
    for (const s of sessions) {
      try {
        const scraper = new Scraper();
        const cookies = parseCookieStringToCookies(s.cookie_string);
        if (cookies.length === 0) continue;
        await scraper.setCookies(cookies);
        const profile = await scraper.me();
        results.push({
          id: s.id,
          auth_token: s.auth_token,
          updated_at: s.updated_at,
          username: profile?.username || null,
          name: profile?.name || null,
          user_id: profile?.id || profile?.id_str || null,
          profile_image_url: profile?.profile_image_url_https || profile?.profile_image_url || null,
        });
      } catch {
        // skip bad session
      }
    }

    return res.json({ success: true, accounts: results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message || 'Unknown error' });
  }
});

// Current user (latest or by query)
app.get(
  '/api/me',
  requireScraper(async (req, res, scraper) => {
    const profile = await scraper.me();
    return res.json({ success: true, profile });
  })
);

// Account-scoped profile
app.get(
  '/api/accounts/:sessionId/me',
  requireScraper(async (req, res, scraper) => {
    const profile = await scraper.me();
    return res.json({ success: true, profile });
  })
);

// Home timeline (latest or by query)
app.get(
  '/api/home-timeline',
  requireScraper(async (req, res, scraper) => {
    const count = Math.min(parseInt(req.query.count) || 50, 200);
    const timeline = await scraper.fetchHomeTimeline(count, []);
    return res.json({ success: true, timeline });
  })
);

// Account-scoped home timeline
app.get(
  '/api/accounts/:sessionId/home',
  requireScraper(async (req, res, scraper) => {
    const count = Math.min(parseInt(req.query.count) || 50, 200);
    const timeline = await scraper.fetchHomeTimeline(count, []);
    return res.json({ success: true, timeline });
  })
);

// Tweet by id
app.get(
  '/api/tweet/:id',
  requireScraper(async (req, res, scraper) => {
    const tweet = await scraper.getTweet(req.params.id);
    return res.json({ success: true, tweet });
  })
);

// Search
app.get(
  '/api/search',
  requireScraper(async (req, res, scraper) => {
    const q = req.query.q;
    if (!q) return res.status(400).json({ success: false, message: 'Missing query parameter q' });
    const count = Math.min(parseInt(req.query.count) || 20, 100);
    const modeStr = (req.query.mode || 'Top').toString();
    const mode = modeStr.toLowerCase() === 'latest' ? SearchMode.Latest : SearchMode.Top;
    const page = await scraper.fetchSearchTweets(q, count, mode);
    return res.json({ success: true, page });
  })
);

// Liked tweets of a user
app.get(
  '/api/likes/:username',
  requireScraper(async (req, res, scraper) => {
    const username = req.params.username;
    const max = Math.min(parseInt(req.query.count) || 50, 200);
    const userIdRes = await getUserIdByScreenName(username, scraper.auth);
    if (!userIdRes.success)
      return res.status(404).json({ success: false, message: userIdRes.err?.message || 'User not found' });
    const data = await fetchLikedTweets(userIdRes.value, max, undefined, scraper.auth);
    return res.json({ success: true, data });
  })
);

// Latest session info (debug)
app.get('/api/session/latest', async (req, res) => {
  try {
    const s = await getSessionFromDb();
    if (!s) return res.status(404).json({ success: false, message: 'No session found' });
      return res.json({ 
        success: true, 
      session: {
        id: s.id,
        auth_token: s.auth_token,
        user_agent: s.user_agent,
        created_at: s.created_at,
        updated_at: s.updated_at,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message || 'Unknown error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server is running on port ${PORT}`);
});