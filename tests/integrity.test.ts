/**
 * Self-verification for the adapter catalog (runs in this repo; also good as CI).
 *   1. Every index.json entry resolves to its <site>/<name>.js and the file's
 *      sha256 matches (the extension's install path enforces this — a mismatch
 *      means an un-installable adapter).
 *   2. Source-lint (the §10.14 regression shapes from the extension): no
 *      numeric-suffixed alias of an opencli error name, no duplicate import of
 *      the same @jackwener/opencli/* module within a file.
 */

import { describe, it, expect } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OPENCLI_ERROR_NAMES = [
  'AuthRequiredError',
  'CommandExecutionError',
  'EmptyResultError',
  'ArgumentError',
  'RateLimitedError',
];

interface IndexEntry {
  site: string;
  name: string;
  source: string;
  sha256: string;
}

async function readIndex(): Promise<{ version: number; adapters: IndexEntry[] }> {
  return JSON.parse(await readFile(join(ROOT, 'index.json'), 'utf8'));
}

async function walkAdapterFiles(): Promise<Array<{ rel: string; src: string }>> {
  const out: Array<{ rel: string; src: string }> = [];
  for (const site of (await readdir(ROOT)).sort()) {
    const sitePath = join(ROOT, site);
    if (site.startsWith('.') || site === 'node_modules' || site === 'tests') continue;
    let s;
    try {
      s = await stat(sitePath);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;
    for (const f of (await readdir(sitePath)).sort()) {
      if (!f.endsWith('.js')) continue;
      out.push({ rel: `${site}/${f}`, src: await readFile(join(sitePath, f), 'utf8') });
    }
  }
  return out;
}

describe('index integrity', () => {
  it('every entry resolves and sha256 matches', async () => {
    const idx = await readIndex();
    expect(idx.adapters.length).toBeGreaterThan(0);
    for (const a of idx.adapters) {
      const buf = await readFile(join(ROOT, a.source));
      const h = createHash('sha256').update(buf).digest('hex');
      expect(h, `sha256 mismatch for ${a.source}`).toBe(a.sha256);
    }
  });
});

describe('adapter source lint', () => {
  it('no numeric-suffixed opencli error aliases; no duplicate opencli imports', async () => {
    for (const { rel, src } of await walkAdapterFiles()) {
      for (const e of OPENCLI_ERROR_NAMES) {
        expect(new RegExp(`\\b${e}\\d\\b`).test(src), `${rel}: aliased ${e}`).toBe(false);
      }
      const imports = [...src.matchAll(/^import\s.*?from\s+'(@jackwener\/opencli\/[^']+)';/gm)].map(
        (m) => m[1],
      );
      const dup = imports.filter((m, i) => imports.indexOf(m) !== i);
      expect(dup, `${rel}: duplicate imports ${dup.join(', ')}`).toEqual([]);
    }
  });
});
