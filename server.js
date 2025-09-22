import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Cookie } from 'tough-cookie';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import net from 'net';
import https from 'https';
import fs from 'fs';
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
// Request logging middleware (structured, one line per request)
let requestSequenceCounter = 0;
app.use((req, res, next) => {
  const seq = ++requestSequenceCounter;
  const startTime = process.hrtime.bigint();
  const startedAt = new Date().toISOString();

  // Ensure we log once the response finishes
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    // Mask API key if present
    const apiKeyHeader = req.headers['x-api-key'] ? '***' : undefined;
    const contentLengthHeader = req.headers['content-length'];

    const logRecord = {
      type: 'request',
      seq,
      time: startedAt,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Math.round(durationMs),
      ip: req.ip,
      user_agent: req.headers['user-agent'] || undefined,
      content_length: contentLengthHeader ? Number(contentLengthHeader) : undefined,
      query: {
        session_id: req.query?.session_id || undefined,
        auth_token: req.query?.auth_token ? 'present' : undefined,
        api_key: apiKeyHeader,
      },
    };

    try {
      // Print as single-line JSON for easy ingestion
      console.log(JSON.stringify(logRecord));
    } catch {
      // Fallback if JSON serialization fails for any reason
      console.log(`[req#${seq}] ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${Math.round(durationMs)}ms`);
    }
  });

  next();
});
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

  // Attach session id for downstream logging/caching
  try {
    scraper.__sessionId = dbSession.id;
  } catch {}

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
      // Expose session id on request for caching purposes
      if (scraper && scraper.__sessionId) {
        req.currentSessionId = scraper.__sessionId;
      }
      return handler(req, res, scraper);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message || 'Unknown error' });
    }
  };
}

// --- Cache tables and helpers ---
async function ensureCacheTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS x_profile_cache (
      session_id BIGINT PRIMARY KEY,
      profile_json JSONB NOT NULL,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS x_home_feed_cache (
      session_id BIGINT PRIMARY KEY,
      pages_json JSONB NOT NULL DEFAULT '[]',
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS x_replies_cache (
      session_id BIGINT NOT NULL,
      tweet_id TEXT NOT NULL,
      replies_json JSONB NOT NULL,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (session_id, tweet_id)
    );
  `);
}

const CACHE_TTL_MINUTES = 15;
function computeExpiryFromNow(minutes = CACHE_TTL_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function getValidProfileCache(sessionId) {
  const { rows } = await pool.query(
    'SELECT profile_json FROM x_profile_cache WHERE session_id = $1 AND expires_at > NOW() LIMIT 1',
    [sessionId]
  );
  return rows[0]?.profile_json || null;
}

async function upsertProfileCache(sessionId, profile) {
  await pool.query(
    `INSERT INTO x_profile_cache (session_id, profile_json, cached_at, expires_at)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (session_id)
     DO UPDATE SET profile_json = EXCLUDED.profile_json, cached_at = NOW(), expires_at = EXCLUDED.expires_at`,
    [sessionId, profile, computeExpiryFromNow()]
  );
}

async function getHomeFeedCache(sessionId) {
  const { rows } = await pool.query(
    'SELECT pages_json, expires_at FROM x_home_feed_cache WHERE session_id = $1 LIMIT 1',
    [sessionId]
  );
  if (!rows[0]) return { pages: [], expired: true };
  const expired = new Date(rows[0].expires_at) <= new Date();
  return { pages: Array.isArray(rows[0].pages_json) ? rows[0].pages_json : [], expired };
}

async function saveHomeFeedCache(sessionId, pages) {
  await pool.query(
    `INSERT INTO x_home_feed_cache (session_id, pages_json, cached_at, expires_at)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (session_id)
     DO UPDATE SET pages_json = EXCLUDED.pages_json, cached_at = NOW(), expires_at = EXCLUDED.expires_at`,
    [sessionId, JSON.stringify(pages), computeExpiryFromNow()]
  );
}

function findNextPageByCursor(pages, cursor) {
  if (!cursor) {
    return pages[0] || null;
  }
  const idx = pages.findIndex((p) => p && p.next_cursor === cursor);
  if (idx >= 0) {
    return pages[idx + 1] || null;
  }
  return null;
}

async function getRepliesCache(sessionId, tweetId) {
  const { rows } = await pool.query(
    'SELECT replies_json FROM x_replies_cache WHERE session_id = $1 AND tweet_id = $2 AND expires_at > NOW() LIMIT 1',
    [sessionId, tweetId]
  );
  return rows[0]?.replies_json || null;
}

async function saveRepliesCache(sessionId, tweetId, replies) {
  await pool.query(
    `INSERT INTO x_replies_cache (session_id, tweet_id, replies_json, cached_at, expires_at)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (session_id, tweet_id)
     DO UPDATE SET replies_json = EXCLUDED.replies_json, cached_at = NOW(), expires_at = EXCLUDED.expires_at`,
    [sessionId, tweetId, JSON.stringify(replies), computeExpiryFromNow()]
  );
}

// Ensure cache tables at boot
ensureCacheTables().catch((e) => console.error('Failed ensureCacheTables', e));

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Apply API key protection to all API endpoints
app.use('/api', requireApiKey);

// Accounts list (with minimal profile)
app.get('/api/accounts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sessions = await getAllSessionsFromDb(limit);

    // Hydrate with profile info (sequential to avoid rate/race); cache for 15m
    const results = [];
    for (const s of sessions) {
      try {
        let profile = await getValidProfileCache(s.id);
        if (!profile) {
        const scraper = new Scraper();
        const cookies = parseCookieStringToCookies(s.cookie_string);
        if (cookies.length === 0) continue;
        await scraper.setCookies(cookies);
          profile = await scraper.me();
          await upsertProfileCache(s.id, profile);
        }

        results.push({
          id: s.id,
          auth_token: s.auth_token,
          updated_at: s.updated_at,
          username: profile?.username || null,
          name: profile?.name || null,
          user_id: profile?.id || profile?.id_str || profile?.userId || null,
          // Provide multiple common keys for PFP to maximize client compatibility
          avatar: profile?.avatar || null,
          profile_image_url_https: profile?.avatar || null,
          profile_image_url: profile?.avatar || null,
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
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const logCtx = { route: '/api/home-timeline', count, cursor };
    const t0 = Date.now();
    try {
      // Try cache when possible
      const sessionId = req.currentSessionId;
      let page;
      if (sessionId) {
        const { pages, expired } = await getHomeFeedCache(sessionId);
        if (!cursor && pages.length > 0 && !expired) {
          const p = pages[0];
          page = {
            items: p.items || [],
            nextCursor: p.next_cursor || undefined,
            previousCursor: p.previous_cursor || undefined,
          };
        } else if (cursor && pages.length > 0 && !expired) {
          const next = findNextPageByCursor(pages, cursor);
          if (next) {
            page = {
              items: next.items || [],
              nextCursor: next.next_cursor || undefined,
              previousCursor: next.previous_cursor || undefined,
            };
          }
        }
      }

      if (!page) {
        page = await scraper.fetchHomeTimeline(count, [], cursor);
        if (sessionId) {
          const { pages } = await getHomeFeedCache(sessionId);
          const newPage = {
            items: page.items,
            next_cursor: page.nextCursor || null,
            previous_cursor: page.previousCursor || null,
            fetched_at: new Date().toISOString(),
          };
          if (!cursor) {
            await saveHomeFeedCache(sessionId, [newPage]);
          } else {
            const merged = Array.isArray(pages) ? pages.slice() : [];
            const exists = merged.some((p) => p && p.next_cursor === newPage.next_cursor);
            if (!exists) merged.push(newPage);
            await saveHomeFeedCache(sessionId, merged);
          }
        }
      }
      const itemsCount = page.items?.length || 0;
      const sampleIds = (page.items || [])
        .slice(0, 5)
        .map((t) => t?.tweet?.rest_id || t?.tweet?.legacy?.id_str)
        .filter(Boolean);
      console.log(
        JSON.stringify({
          type: 'home_timeline_success',
          ...logCtx,
          itemsCount,
          nextCursor: page.nextCursor ? 'present' : null,
          previousCursor: page.previousCursor ? 'present' : null,
          sampleIds,
          duration_ms: Date.now() - t0,
        })
      );
      // Back-compat alias: expose items under `timeline`
      return res.json({
        success: true,
        items: page.items,
        timeline: page.items,
        nextCursor: page.nextCursor,
        previousCursor: page.previousCursor,
      });
    } catch (e) {
      console.error(
        JSON.stringify({
          type: 'home_timeline_error',
          ...logCtx,
          error: e?.message || String(e),
          duration_ms: Date.now() - t0,
        })
      );
      return res.status(500).json({ success: false, message: e?.message || 'Unknown error' });
    }
  })
);

// Account-scoped home timeline
app.get(
  '/api/accounts/:sessionId/home',
  requireScraper(async (req, res, scraper) => {
    const count = Math.min(parseInt(req.query.count) || 50, 200);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const logCtx = { route: '/api/accounts/:sessionId/home', sessionId: req.params.sessionId, count, cursor };
    const t0 = Date.now();
    try {
      const sessionId = req.currentSessionId;
      let page;
      if (sessionId) {
        const { pages, expired } = await getHomeFeedCache(sessionId);
        if (!cursor && pages.length > 0 && !expired) {
          const p = pages[0];
          page = {
            items: p.items || [],
            nextCursor: p.next_cursor || undefined,
            previousCursor: p.previous_cursor || undefined,
          };
        } else if (cursor && pages.length > 0 && !expired) {
          const next = findNextPageByCursor(pages, cursor);
          if (next) {
            page = {
              items: next.items || [],
              nextCursor: next.next_cursor || undefined,
              previousCursor: next.previous_cursor || undefined,
            };
          }
        }
      }

      if (!page) {
        page = await scraper.fetchHomeTimeline(count, [], cursor);
        if (sessionId) {
          const { pages } = await getHomeFeedCache(sessionId);
          const newPage = {
            items: page.items,
            next_cursor: page.nextCursor || null,
            previous_cursor: page.previousCursor || null,
            fetched_at: new Date().toISOString(),
          };
          if (!cursor) {
            await saveHomeFeedCache(sessionId, [newPage]);
          } else {
            const merged = Array.isArray(pages) ? pages.slice() : [];
            const exists = merged.some((p) => p && p.next_cursor === newPage.next_cursor);
            if (!exists) merged.push(newPage);
            await saveHomeFeedCache(sessionId, merged);
          }
        }
      }
      const itemsCount = page.items?.length || 0;
      const sampleIds = (page.items || [])
        .slice(0, 5)
        .map((t) => t?.tweet?.rest_id || t?.tweet?.legacy?.id_str)
        .filter(Boolean);
      console.log(
        JSON.stringify({
          type: 'home_timeline_success',
          ...logCtx,
          itemsCount,
          nextCursor: page.nextCursor ? 'present' : null,
          previousCursor: page.previousCursor ? 'present' : null,
          sampleIds,
          duration_ms: Date.now() - t0,
        })
      );
      return res.json({
        success: true,
        items: page.items,
        timeline: page.items,
        nextCursor: page.nextCursor,
        previousCursor: page.previousCursor,
      });
    } catch (e) {
      console.error(
        JSON.stringify({
          type: 'home_timeline_error',
          ...logCtx,
          error: e?.message || String(e),
          duration_ms: Date.now() - t0,
        })
      );
      return res.status(500).json({ success: false, message: e?.message || 'Unknown error' });
    }
  })
);

// Alias: Account-scoped home timeline (expected by iOS client)
app.get(
  '/api/accounts/:sessionId/home-timeline',
  requireScraper(async (req, res, scraper) => {
    const count = Math.min(parseInt(req.query.count) || 50, 200);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const logCtx = { route: '/api/accounts/:sessionId/home-timeline', sessionId: req.params.sessionId, count, cursor };
    const t0 = Date.now();
    try {
      const sessionId = req.currentSessionId;
      let page;
      if (sessionId) {
        const { pages, expired } = await getHomeFeedCache(sessionId);
        if (!cursor && pages.length > 0 && !expired) {
          const p = pages[0];
          page = {
            items: p.items || [],
            nextCursor: p.next_cursor || undefined,
            previousCursor: p.previous_cursor || undefined,
          };
        } else if (cursor && pages.length > 0 && !expired) {
          const next = findNextPageByCursor(pages, cursor);
          if (next) {
            page = {
              items: next.items || [],
              nextCursor: next.next_cursor || undefined,
              previousCursor: next.previous_cursor || undefined,
            };
          }
        }
      }

      if (!page) {
        page = await scraper.fetchHomeTimeline(count, [], cursor);
        if (sessionId) {
          const { pages } = await getHomeFeedCache(sessionId);
          const newPage = {
            items: page.items,
            next_cursor: page.nextCursor || null,
            previous_cursor: page.previousCursor || null,
            fetched_at: new Date().toISOString(),
          };
          if (!cursor) {
            await saveHomeFeedCache(sessionId, [newPage]);
          } else {
            const merged = Array.isArray(pages) ? pages.slice() : [];
            const exists = merged.some((p) => p && p.next_cursor === newPage.next_cursor);
            if (!exists) merged.push(newPage);
            await saveHomeFeedCache(sessionId, merged);
          }
        }
      }
      const itemsCount = page.items?.length || 0;
      const sampleIds = (page.items || [])
        .slice(0, 5)
        .map((t) => t?.tweet?.rest_id || t?.tweet?.legacy?.id_str)
        .filter(Boolean);
      console.log(
        JSON.stringify({
          type: 'home_timeline_success',
          ...logCtx,
          itemsCount,
          nextCursor: page.nextCursor ? 'present' : null,
          previousCursor: page.previousCursor ? 'present' : null,
          sampleIds,
          duration_ms: Date.now() - t0,
        })
      );
      return res.json({
        success: true,
        items: page.items,
        timeline: page.items,
        nextCursor: page.nextCursor,
        previousCursor: page.previousCursor,
      });
    } catch (e) {
      console.error(
        JSON.stringify({
          type: 'home_timeline_error',
          ...logCtx,
          error: e?.message || String(e),
          duration_ms: Date.now() - t0,
        })
      );
      return res.status(500).json({ success: false, message: e?.message || 'Unknown error' });
    }
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

// Replies for a tweet (threaded conversation)
app.get(
  '/api/tweet/:id/replies',
  requireScraper(async (req, res, scraper) => {
    const tweetId = String(req.params.id);
    const sessionId = req.currentSessionId;
    const t0 = Date.now();
    const logCtx = { route: '/api/tweet/:id/replies', tweetId, sessionId };
    try {
      const hasMethod = typeof scraper.getConversation === 'function';
      console.log(JSON.stringify({ type: 'replies_debug', ...logCtx, hasMethod }));
      let replies = null;
      if (sessionId) {
        replies = await getRepliesCache(sessionId, tweetId);
      }

      if (!replies) {
        const convo = hasMethod ? await scraper.getConversation(tweetId) : [];
        // All tweets in the conversation except the focal
        const all = convo.filter((t) => t && t.id !== tweetId);
        // Direct replies to focal
        const direct = all.filter((t) => t && t.inReplyToStatusId === tweetId);
        replies = direct.length > 0 ? direct : all;
        if (sessionId) await saveRepliesCache(sessionId, tweetId, replies);
        const sampleIds = all.slice(0, 5).map((t) => t.id);
        console.log(
          JSON.stringify({
            type: 'replies_conversation_debug',
            ...logCtx,
            convoCount: convo.length,
            allCount: all.length,
            directCount: replies.length,
            sampleIds,
          })
        );
      }

      console.log(
        JSON.stringify({
          type: 'replies_success',
          ...logCtx,
          count: Array.isArray(replies) ? replies.length : 0,
          duration_ms: Date.now() - t0,
        })
      );
      // Include minimal meta to help client-side debugging
      const directCount = Array.isArray(replies) ? replies.length : 0;
      return res.json({ success: true, replies, meta: { directCount } });
    } catch (e) {
      console.error(
        JSON.stringify({
          type: 'replies_error',
          ...logCtx,
          error: e?.message || String(e),
          stack: e?.stack || undefined,
          duration_ms: Date.now() - t0,
        })
      );
      return res.status(500).json({ success: false, message: e?.message || 'Unknown error' });
    }
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

var privateKey = fs.readFileSync('certbot/live/timeline-tuner-fyp.soc1024.com/privkey.pem');
var certificate = fs.readFileSync('certbot/live/timeline-tuner-fyp.soc1024.com/fullchain.pem');
var credentials = {key: privateKey, cert: certificate};

var httpsServer = https.createServer(credentials, app);

httpsServer.listen(PORT, '0.0.0.0', () => {
  console.log(`API server is running on port ${PORT}`);
});
