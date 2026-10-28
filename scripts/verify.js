import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { startDevServer } from './dev-server.js';
import { verifyPlatform } from '../tests/platform.js';

const base = process.env.BUILD_URL;
const name = base ? 'hosted' : 'local';
const token = process.env.BUILD_TOKEN ?? 'local-demo';
const state = base ? null : mkdtempSync(join(tmpdir(), 'vite-workers-test-'));
let server;
const request = (path, init) => fetch(new URL(path, base ?? server.base), { ...init, signal: AbortSignal.timeout(60_000) });
try {
  if (!base) server = await startDevServer({ state });
  const report = await verifyPlatform(request, token);
  if (server) {
    await server.stop();
    server = await startDevServer({ state });
    assert.equal((await request(report.preview)).status, 200);
    const task = await (await request(report.serverUrl + 'task')).json();
    assert.equal(task.revision, report.revision);
    assert.equal(task.message, 'Hello from server.ts');
    report.checks.push('Client preview and compiled server survive a complete cf dev restart');
  }
  saveReport({ status: 'passed', ...report });
  for (const check of report.checks) console.log(`PASS: ${check}`);
  console.log(`Measurements saved to reports/${name}.json`);
} catch (error) {
  saveReport({ status: 'failed', error: error.message });
  throw error;
} finally {
  await server?.stop();
  if (state) rmSync(state, { recursive: true, force: true });
}

function saveReport(result) {
  mkdirSync('reports', { recursive: true });
  writeFileSync(`reports/${name}.json`, JSON.stringify({
    checkedAt: new Date().toISOString(), base: base ?? 'local cf dev', ...result
  }, null, 2));
}
