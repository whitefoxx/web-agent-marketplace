# webchat-agent-marketplace

The adapter catalog for [WebChat Agent](https://github.com/whitefoxx/webchat-agent)
— site-specific "adapters" (deterministic `cli({…})` commands that read/act on a
site) that the extension browses and installs **on demand over HTTPS**, so the
extension itself stays small (only the generic browser tools ship in the bundle).

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
