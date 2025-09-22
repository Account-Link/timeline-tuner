/*
Standalone script: fetch-timeline-from-cookie.js

Usage:
1) Paste your full Twitter/X Cookie header into COOKIE_HEADER below.
   Example: "kdt=...; ct0=...; guest_id=...; auth_token=...; twid=u%3D..."
2) Run one of the following:
   node fetch-timeline-from-cookie.js | jq
   COUNT=100 node fetch-timeline-from-cookie.js | jq
   CURSOR="CURSOR_STRING" node fetch-timeline-from-cookie.js | jq
   node fetch-timeline-from-cookie.js 100 | jq

Notes:
- Output includes: items, nextCursor, previousCursor.
- Keep your cookie secret; it grants account access.
- Requires Node 18+ and project deps installed.
- Uses the same Scraper as server.js; no database required.
*/

import { Cookie } from 'tough-cookie';
import { Scraper, SearchMode } from './dist/node/esm/index.mjs';

// Paste your full Cookie header string from a logged-in Twitter/X session.
// Example format:
// "kdt=...; ct0=...; guest_id=...; auth_token=...; twid=u%3D..."
// IMPORTANT: Use a valid session cookie string. Do not share it.
const COOKIE_HEADER = `PASTE_COOKIE_HEADER_HERE`;

function parseCookieStringToCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return [];
  return cookieHeader
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && s.includes('='))
    .map((s) => Cookie.parse(s))
    .filter(Boolean);
}

async function fetchHomeTimelineFromCookie(cookieHeader, count = 50, cursor) {
  const cookies = parseCookieStringToCookies(cookieHeader);
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error('No valid cookies parsed. Ensure COOKIE_HEADER is a full Cookie header string.');
  }
  const scraper = new Scraper();
  await scraper.setCookies(cookies);
  const page = await scraper.fetchHomeTimeline(count, [], cursor);
  return page;
}

async function main() {
  try {
    if (!COOKIE_HEADER || COOKIE_HEADER.includes('PASTE_COOKIE_HEADER_HERE')) {
      console.error('Please paste your full Cookie header into COOKIE_HEADER at the top of this script.');
      process.exit(1);
    }

    // Optional overrides via env or argv
    const envCount = process.env.COUNT ? parseInt(process.env.COUNT, 10) : undefined;
    const argCount = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
    const count = Math.min(Number(envCount || argCount || 50) || 50, 200);
    const cursor = process.env.CURSOR || undefined;

    const page = await fetchHomeTimelineFromCookie(COOKIE_HEADER, count, cursor);
    const output = {
      success: true,
      itemsCount: Array.isArray(page?.items) ? page.items.length : 0,
      nextCursor: page?.nextCursor || null,
      previousCursor: page?.previousCursor || null,
      // Keep full items for client processing
      items: page?.items || [],
    };
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    const errorOut = { success: false, message: err?.message || String(err) };
    console.error(JSON.stringify(errorOut, null, 2));
    process.exit(1);
  }
}

await main();


