# webchat-agent-marketplace

The adapter catalog for [WebChat Agent](https://github.com/whitefoxx/webchat-agent)
— site-specific "adapters" (deterministic `cli({…})` commands that read/act on a
site) that the extension browses and installs **on demand over HTTPS**, so the
extension itself stays small (only the generic browser tools ship in the bundle).

## What's inside — 290 adapters across 28 sites

Grouped by what you'd reach for:

- **Social & discussion** — weibo (10), xiaohongshu (10), zhihu (14), douyin (11), tiktok (6), instagram (16), twitter (34), bluesky (9), linkedin (20), reddit (20), v2ex (11), lobsters (6), hackernews (9)
- **Video & audio** — bilibili (16), youtube (14)
- **Reading & knowledge** — douban (8), weread (9), weread-official (8), wikipedia (5), arxiv (4), devto (3), stackoverflow (4), producthunt (4)
- **AI assistants & tools** — chatgpt (7), claude (7), gemini (4), jimeng (4), notebooklm (17)

Each adapter drives the site through **your own logged-in browser** (real session,
no re-auth), deterministically — fast, cheap, reliable vs. raw computer-use.

## Install — just tell your agent

You don't clone or configure anything. In the WebChat Agent extension, ask in
plain language — the agent finds and installs the right adapter, then verifies it:

> “有没有现成的 微博 搜索工具?装上试试” · “install a Reddit comment adapter and verify it works”

Under the hood it uses `find_adapters` (bilingual site aliases + task synonyms —
微博→weibo, 领英→linkedin, 搜索↔search) to locate a candidate, then `load_adapter`
(one-off) or `install_adapter`. No manual browsing required.

## Layout (schema v2)

```
index.json              metadata-only catalog: { version, count, adapters: [...] }
<site>/<name>.js        one adapter per file (the cli({...}) source)
```

Each `index.json` entry carries a **sha256** of the exact `<site>/<name>.js`
bytes. The extension fetches `index.json` to populate the browse grid, then pulls
`<site>/<name>.js` only when the user clicks Install and **verifies the sha256
before registering** — so a tampered file is refused.

Served via GitHub raw:
`https://raw.githubusercontent.com/whitefoxx/webchat-agent-marketplace/main/`

## Editing / contributing

`<site>/<name>.js` is the authoritative source (hand-maintained; many adapters
originate from [opencli](https://github.com/jackwener/opencli)). After editing an
adapter you MUST rotate its `sha256` (and any changed `description`/`access`/
`domain`) in `index.json` — the install path enforces the hash, so a mismatch is
refused. (The source-lint invariants + index-regen tooling live in the
[webchat-agent](https://github.com/whitefoxx/webchat-agent) repo's history.)
