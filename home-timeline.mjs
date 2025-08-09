// Fetch your Home timeline using cookies, with optional proxy support
// Usage:
//   1) Put your exported cookies JSON at ./cookies.json (see README notes)
//   2) npm run build
//   3) node home-timeline.mjs               # without proxy
//      PROXY_URL=http://host:port node home-timeline.mjs
//      PROXY_URL=http://user:pass@host:port node home-timeline.mjs

import fs from 'fs';
import dotenv from 'dotenv';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { Scraper } from 'agent-twitter-client';

dotenv.config();
// Also load optional .env.fyp if present (useful to store PROXY_URL)
try {
  const fypPath = new URL('./.env.fyp', import.meta.url).pathname;
  if (fs.existsSync(fypPath)) {
    dotenv.config({ path: fypPath, override: true });
  }
} catch {}

function normalizeCookieToSetCookieString(cookieObj) {
  // Support common export formats (name/value vs key/value)
  const key = cookieObj.key ?? cookieObj.name;
  const value = cookieObj.value;
  const domain = cookieObj.domain ?? '.twitter.com';
  const path = cookieObj.path ?? '/';
  const secure = cookieObj.secure !== false; // default to true
  const httpOnly = cookieObj.httpOnly ?? cookieObj.http_only ?? false;
  const sameSite = cookieObj.sameSite ?? cookieObj.same_site ?? 'Lax';

  if (!key || value == null) {
    throw new Error('Invalid cookie entry: expected key/name and value');
  }

  return `${key}=${value}; Domain=${domain}; Path=${path}; ${secure ? 'Secure; ' : ''}${httpOnly ? 'HttpOnly; ' : ''}SameSite=${sameSite}`;
}

async function main() {
  const proxyUrl = process.env.PROXY_URL;
  let agent = undefined;

  if (proxyUrl) {
    let parsed;
    try {
      parsed = new URL(proxyUrl);
    } catch (e) {
      // Accept non-standard format like scheme://host:port:username:password
      const m = /^(\w+):\/\/([^:\/]+):(\d+):([^:]+):(.+)$/.exec(proxyUrl);
      if (m) {
        const [, scheme, host, port, user, pass] = m;
        parsed = new URL(`${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`);
      } else {
        throw new Error(`Invalid PROXY_URL. Use http(s)://user:pass@host:port or socks5://user:pass@host:port`);
      }
    }

    const protocol = parsed.protocol.replace(':', '').toLowerCase();
    if (protocol === 'http' || protocol === 'https') {
      const username = parsed.username;
      const password = parsed.password;
      // Strip auth in the uri we pass to undici
      parsed.username = '';
      parsed.password = '';

      const agentOptions = {
        uri: parsed.toString(),
        requestTls: { rejectUnauthorized: false },
      };
      if (username && password) {
        agentOptions.token = `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString('base64')}`;
      }
      agent = new ProxyAgent(agentOptions);
      setGlobalDispatcher(agent);
      console.log(`Using HTTP proxy: ${parsed.toString()}`);
    } else if (protocol.startsWith('socks')) {
      // Undici's ProxyAgent does not support SOCKS. Fail fast with guidance.
      throw new Error(
        'SOCKS proxies are not supported by this script. Use an HTTP/HTTPS proxy (e.g., PROXY_URL=http://user:pass@host:port) or run through a local HTTP-to-SOCKS bridge.'
      );
    } else {
      throw new Error(`Unsupported proxy protocol: ${protocol}`);
    }
  }

  // Read cookies.json (array of cookie objects as exported from a browser)
  const cookiesPath = process.env.COOKIES_PATH || './cookies.json';
  if (!fs.existsSync(cookiesPath)) {
    throw new Error(`Missing ${cookiesPath}. Export your twitter.com cookies to this file.`);
  }

  const rawCookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
  let cookiesArray;
  if (Array.isArray(rawCookies)) {
    cookiesArray = rawCookies;
  } else if (rawCookies && typeof rawCookies === 'object') {
    // Accept a simple key/value map as provided by the user
    cookiesArray = Object.entries(rawCookies).map(([key, value]) => ({
      key,
      value,
      domain: '.twitter.com',
      path: '/',
      secure: true,
      httpOnly: false,
    }));
  } else {
    throw new Error('cookies.json must be an array of cookie objects or a key/value object.');
  }

  if (!Array.isArray(cookiesArray) || cookiesArray.length === 0) {
    throw new Error('No cookies found in cookies.json');
  }

  const cookieStrings = cookiesArray.map(normalizeCookieToSetCookieString);

  const scraper = new Scraper({
    transform: {
      request: (input, init = {}) => {
        if (agent) return [input, { ...init, dispatcher: agent }];
        return [input, init];
      },
    },
  });

  await scraper.setCookies(cookieStrings);
  console.log('Cookies installed. Fetching Home timeline...');

  const tweetsWithFeedback = await scraper.fetchHomeTimeline(20, []);
  console.log(`Fetched ${tweetsWithFeedback.length} entries.`);

  // Print a compact view of the first few tweets
  for (const [index, item] of tweetsWithFeedback.slice(0, 5).entries()) {
    const tweet = item.tweet;
    const id = tweet?.rest_id || tweet?.legacy?.id_str || 'unknown-id';
    const text = tweet?.legacy?.full_text || tweet?.core?.legacy?.full_text || tweet?.note_tweet?.note_tweet_results?.result?.text || '';
    const author = tweet?.core?.user_results?.result?.legacy?.screen_name || tweet?.core?.legacy?.screen_name || 'unknown';
    console.log(`${index + 1}. ${author}: ${id} ${text ? `\n   ${text.slice(0, 140).replace(/\s+/g, ' ')}${text.length > 140 ? '…' : ''}` : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


