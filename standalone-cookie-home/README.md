# Cookie Home Timeline (Standalone)

Fetch Twitter/X Home timeline using browser cookies, with optional HTTP/HTTPS proxy.

## Setup

1) Copy your `twitter.com` cookies to `cookies.json` in this folder.
   - Supports either an array of cookie objects (export from Cookie-Editor) or a simple key/value object:
```json
{
  "auth_token": "...",
  "ct0": "...",
  "twid": "..."
}
```

2) Install and run
```bash
npm install
npm start
```

Optional: proxy
```bash
PROXY_URL=http://host:port npm start
PROXY_URL=http://user:pass@host:port npm start
# or create a .env.fyp in this folder with:
# PROXY_URL=http://user:pass@host:port
# then just run:
# npm start
```

Notes
- SOCKS proxies are not supported directly. Use an HTTP/HTTPS proxy (or a local HTTP-to-SOCKS bridge).
- To change cookies path: `COOKIES_PATH=/absolute/path/to/cookies.json npm start`.
- This package depends on `agent-twitter-client` from the parent directory via `file:..`. For a new repo, replace that dependency with the published version or your fork.
