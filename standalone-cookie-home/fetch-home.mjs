// Minimal standalone Home timeline fetcher using cookies and optional HTTP proxy
// Move this folder into a new repo to reuse. Keep package.json as-is to consume agent-twitter-client.

import fs from 'fs';
import dotenv from 'dotenv';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { Scraper } from 'agent-twitter-client';

dotenv.config();
// Load optional .env.fyp from this folder if present
try {
  const fypPath = new URL('./.env.fyp', import.meta.url).pathname;
  if (fs.existsSync(fypPath)) {
    dotenv.config({ path: fypPath, override: true });
  }
} catch {}

function normalizeCookieToSetCookieString(cookieObj) {
  const key = cookieObj.key ?? cookieObj.name;
  const value = cookieObj.value;
  const domain = cookieObj.domain ?? '.twitter.com';
  const path = cookieObj.path ?? '/';
  const secure = cookieObj.secure !== false;
  const httpOnly = cookieObj.httpOnly ?? cookieObj.http_only ?? false;
  const sameSite = cookieObj.sameSite ?? cookieObj.same_site ?? 'Lax';
  if (!key || value == null) throw new Error('Invalid cookie entry');
  return `${key}=${value}; Domain=${domain}; Path=${path}; ${secure ? 'Secure; ' : ''}${httpOnly ? 'HttpOnly; ' : ''}SameSite=${sameSite}`;
}

function buildProxyAgentFromEnv() {
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) return undefined;
  let parsed;
  try {
    parsed = new URL(proxyUrl);
  } catch (e) {
    const m = /^(\w+):\/\/([^:\/]+):(\d+):([^:]+):(.+)$/.exec(proxyUrl);
    if (m) {
      const [, scheme, host, port, user, pass] = m;
      parsed = new URL(`${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`);
    } else {
      throw new Error('Invalid PROXY_URL format. Use http(s)://user:pass@host:port');
    }
  }
  const protocol = parsed.protocol.replace(':', '').toLowerCase();
  if (protocol !== 'http' && protocol !== 'https') {
    throw new Error('Only HTTP/HTTPS proxies are supported by undici ProxyAgent');
  }
  const username = parsed.username;
  const password = parsed.password;
  parsed.username = '';
  parsed.password = '';
  const agentOptions = {
    uri: parsed.toString(),
    requestTls: { rejectUnauthorized: false },
  };
  if (username && password) {
    agentOptions.token = `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString('base64')}`;
  }
  const agent = new ProxyAgent(agentOptions);
  setGlobalDispatcher(agent);
  return agent;
}

async function main() {
  const cookiesPath = process.env.COOKIES_PATH || new URL('./cookies.json', import.meta.url).pathname;
  if (!fs.existsSync(cookiesPath)) {
    throw new Error(`Missing ${cookiesPath}. Provide a cookies.json`);
  }
  const rawCookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
  let cookiesArray;
  if (Array.isArray(rawCookies)) {
    cookiesArray = rawCookies;
  } else if (rawCookies && typeof rawCookies === 'object') {
    cookiesArray = Object.entries(rawCookies).map(([key, value]) => ({ key, value, domain: '.twitter.com', path: '/', secure: true }));
  } else {
    throw new Error('cookies.json must be an array or key/value object');
  }
  const cookieStrings = cookiesArray.map(normalizeCookieToSetCookieString);

  const agent = buildProxyAgentFromEnv();
  const scraper = new Scraper({
    transform: {
      request: (input, init = {}) => agent ? [input, { ...init, dispatcher: agent }] : [input, init],
    },
  });

  await scraper.setCookies(cookieStrings);
  const tweets = await scraper.fetchHomeTimeline(20, []);
  console.log(`Fetched ${tweets.length} entries`);
  for (const [i, item] of tweets.slice(0, 5).entries()) {
    const t = item.tweet;
    const id = t?.rest_id || t?.legacy?.id_str || 'unknown-id';
    const author = t?.core?.user_results?.result?.legacy?.screen_name || 'unknown';
    const text = t?.legacy?.full_text || t?.note_tweet?.note_tweet_results?.result?.text || '';
    console.log(`${i + 1}. ${author}: ${id}\n   ${text.slice(0, 140).replace(/\s+/g, ' ')}${text.length > 140 ? '…' : ''}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


