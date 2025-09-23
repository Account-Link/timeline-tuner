/*
Standalone script: fetch-user-tweets-from-cookie.js

Purpose:
- Paste a full Twitter/X Cookie header inline.
- Fetch all tweets for a given username using Twitter web endpoints via Scraper.

Usage:
1) Paste your full Cookie header into COOKIE_HEADER below.
   Example: "kdt=...; ct0=...; guest_id=...; auth_token=...; twid=u%3D..."
2) Provide the username and optional limits:
   node fetch-user-tweets-from-cookie.js <username> [maxTweets]

   Examples:
   node fetch-user-tweets-from-cookie.js elonmusk | jq
   node fetch-user-tweets-from-cookie.js elonmusk 500 | jq

   Environment overrides:
   MAX_TWEETS=1000 node fetch-user-tweets-from-cookie.js elonmusk | jq

Notes:
- Output includes a summary and an array of tweets.
- Keep your cookie secret; it grants account access.
- Requires Node 18+ and project deps installed.
- Uses the same Scraper as server.js; no database required.
*/

import { Cookie } from 'tough-cookie';
import { Scraper, getUserIdByScreenName } from './dist/node/esm/index.mjs';

// Paste your full Cookie header string from a logged-in Twitter/X session.
const COOKIE_HEADER = `ct0=;auth_token=;`;

function parseCookieStringToCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return [];
  return cookieHeader
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && s.includes('='))
    .map((s) => Cookie.parse(s))
    .filter(Boolean);
}

async function getUserId(scraper, username) {
  // Prefer the helper using the scraper's auth context when available
  if (typeof scraper.getUserIdByScreenName === 'function') {
    return await scraper.getUserIdByScreenName(username);
  }
  // Fallback to standalone function (should also work with scraper.auth)
  const res = await getUserIdByScreenName(username, scraper.auth);
  if (!res?.success) throw res?.err || new Error('Failed to resolve user id');
  return res.value;
}

async function fetchTweetsForUser(scraper, username, maxTweets) {
  const userId = await getUserId(scraper, username);

  // Prefer iterator that keeps requesting until maxTweets or no cursor
  const tweets = [];
  const iterator = scraper.getUserTweetsIterator(userId, maxTweets);
  for await (const tweet of iterator) {
    tweets.push(tweet);
    if (tweets.length >= maxTweets) break;
  }
  return { userId, tweets };
}

async function main() {
  try {
    const username = process.argv[2];
    if (!username) {
      console.error('Usage: node fetch-user-tweets-from-cookie.js <username> [maxTweets]');
      process.exit(1);
    }

    if (!COOKIE_HEADER || COOKIE_HEADER.includes('PASTE_COOKIE_HEADER_HERE')) {
      console.error('Please paste your full Cookie header into COOKIE_HEADER at the top of this script.');
      process.exit(1);
    }

    const envMax = process.env.MAX_TWEETS ? parseInt(process.env.MAX_TWEETS, 10) : undefined;
    const argMax = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
    const maxTweets = Math.max(1, Math.min(Number(envMax || argMax || 200) || 200, 5000));

    const cookies = parseCookieStringToCookies(COOKIE_HEADER);
    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new Error('No valid cookies parsed. Ensure COOKIE_HEADER is a full Cookie header string.');
    }

    const scraper = new Scraper();
    await scraper.setCookies(cookies);

    const { userId, tweets } = await fetchTweetsForUser(scraper, username, maxTweets);

    const output = {
      success: true,
      username,
      userId,
      count: tweets.length,
      tweets,
    };
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    const errorOut = { success: false, message: err?.message || String(err) };
    console.error(JSON.stringify(errorOut, null, 2));
    process.exit(1);
  }
}

await main();



