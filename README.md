# Agent Twitter API (API-only)


```
screen -S fyp-api
screen -r fyp-api
pnpm start
```

Minimal Express API that authenticates to X/Twitter using cookie sessions stored in your database. No frontend. No username/password flows.

## Overview

- Auth is resolved from `x_sessions` in your database (see schema expectations below)
- You can select a session per-request via query params
- Endpoints expose basic Twitter actions and data (me, home timeline, tweet, search, likes)

## Environment

Create `.env`:

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
PROXY_URL=http://user:pass@proxyhost:port   # optional
PORT=8000                                   # optional, defaults to 8000
SESSION_SECRET=some-secret                  # optional
```

If `PROXY_URL` is set, outbound HTTP(S) requests use it.

## Expected DB schema

Table `x_sessions` should contain at least:

- `id` (primary key)
- `auth_token` (text)
- `user_agent` (text)
- `cookies_json` (text/json) — optional, not used by the server
- `cookie_string` (text) — a full Cookie header string with keys like `kdt`, `ct0`, `guest_id`, `auth_token`, `twid`, etc.
- `created_at` (timestamp)
- `updated_at` (timestamp)

Example row:

```
1, "9f41dbea3928c4239b2482265df47c7d794aebdc", "Mozilla/5.0 (iPhone; ... Safari/604.1)",
"{ ... }",
"kdt=...; ct0=...; guest_id=...; auth_token=9f41d...; twid=u%3D...",
"2025-08-09 00:16:14.305848+00", "2025-08-09 00:16:14.305848+00"
```

The server authenticates a client by parsing `cookie_string`.

## Session resolution per request

You can choose which session the request uses by adding one of these query params:

- `?session_id=<id>` — uses the row by `x_sessions.id`
- `?auth_token=<token>` — uses the row by `x_sessions.auth_token` (most recent)
- No param — uses the most recently updated row

## Install & run

```bash
pnpm install
pnpm start
# Server runs on http://localhost:8000 by default
```

## Endpoints

- GET `/health` → `{ ok: true }`
- GET `/api/session/latest` → metadata of the latest DB session (debug)
- GET `/api/me` → current logged-in profile
- GET `/api/home-timeline?count=50` → home timeline (max 200)
- GET `/api/tweet/:id` → tweet by ID
- GET `/api/search?q=term&count=20&mode=Top|Latest` → search tweets (count max 100)
- GET `/api/likes/:username?count=50` → tweets liked by `:username` (count max 200)

Notes
- Add `?session_id=` or `?auth_token=` to use a specific DB session
- Errors: 401 (no valid session), 404 (not found), 500 (server error)

## curl examples

Set a base URL for convenience:

```bash
BASE=http://localhost:8000
```

Health:

```bash
curl -s "$BASE/health"
```

Latest session metadata:

```bash
curl -s "$BASE/api/session/latest" | jq
```

Current user (latest session):

```bash
curl -s "$BASE/api/me" | jq
```

Current user by session id:

```bash
curl -s "$BASE/api/me?session_id=1" | jq
```

Current user by auth_token:

```bash
curl -s "$BASE/api/me?auth_token=9f41dbea3928c4239b2482265df47c7d794aebdc" | jq
```

Home timeline (default 50):

```bash
curl -s "$BASE/api/home-timeline" | jq
```

Home timeline for session id, count=100:

```bash
curl -s "$BASE/api/home-timeline?session_id=1&count=100" | jq
```

Tweet by ID:

```bash
curl -s "$BASE/api/tweet/1870000000000000000?session_id=1" | jq
```

Search Top (default 20):

```bash
curl -s "$BASE/api/search?q=machine%20learning" | jq
```

Search Latest, count=50, session id:

```bash
curl -s "$BASE/api/search?q=machine%20learning&mode=Latest&count=50&session_id=1" | jq
```

Liked tweets by username (default 50):

```bash
curl -s "$BASE/api/likes/elonmusk" | jq
```

Liked tweets by username, count=100, session id:

```bash
curl -s "$BASE/api/likes/elonmusk?count=100&session_id=1" | jq
```

Use auth_token instead of session id:

```bash
curl -s "$BASE/api/likes/elonmusk?auth_token=9f41dbea3928c4239b2482265df47c7d794aebdc" | jq
```

## iOS / mobile client access

To allow native apps to call the API directly:

- Set an API key in your environment (recommended in production):

```
API_KEY=your-strong-random-key
# Optionally restrict CORS for web clients
ALLOWED_ORIGINS=https://your-webapp.example,https://another.example
```

- Send the key on requests via header or query:
  - Header: `X-API-Key: your-strong-random-key`
  - Query param: `?api_key=your-strong-random-key` (use only over HTTPS)

- Example iOS URLRequest (Swift):

```swift
var request = URLRequest(url: URL(string: "https://api.example.com/api/home-timeline?count=50")!)
request.httpMethod = "GET"
request.setValue("your-strong-random-key", forHTTPHeaderField: "X-API-Key")
// Perform with URLSession
```

Notes
- CORS is enabled for browser-based clients; native iOS apps are not restricted by CORS.
- Always serve this API over HTTPS. If you run on-device with a non-TLS URL during development, configure ATS exceptions accordingly.

## Proxy usage

Start the server with a proxy:

```bash
export PROXY_URL=http://user:pass@host:port
pnpm start
```

## License

MIT