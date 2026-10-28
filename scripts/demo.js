import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDevServer } from './dev-server.js';

const state = mkdtempSync(join(tmpdir(), 'vite-workers-demo-'));
let server;
const backend = process.argv.includes('--backend');
const project = JSON.parse(readFileSync(new URL(backend ? '../prepared/example.json' : '../examples/library.json', import.meta.url), 'utf8'));

async function post(base, path, body) {
  const response = await fetch(new URL(path, base), {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.BUILD_TOKEN ?? 'local-demo'}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000)
  });
  const text = await response.text();
  if (!response.ok) throw Error(text);
  return JSON.parse(text);
}

try {
  server = await startDevServer({ state });
  const bundle = await post(server.base, '/build', project);
  const result = backend ? await (await fetch(new URL(bundle.serverUrl + 'task', server.base))).json() : bundle;
  console.log(JSON.stringify(result, null, 2));
} finally {
  await server?.stop();
  rmSync(state, { recursive: true, force: true });
}
