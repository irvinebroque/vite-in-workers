import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { startRuntime } from './runtime.js';
import { verifyPlatform } from '../tests/platform.js';

const base = process.env.BUILD_URL;
const name = base ? 'hosted' : 'local';
const token = process.env.BUILD_TOKEN ?? 'local-demo';
const state = base ? null : mkdtempSync(join(tmpdir(), 'vite-workers-test-'));
let runtime = base ? null : startRuntime({ r2Persist: state });
const request = (path, init) => runtime ? runtime.dispatchFetch('http://demo' + path, init) : fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(60_000) });
try {
  const report = await verifyPlatform(request, token, { checkCpuLimit: Boolean(base) });
  if (runtime) {
    await runtime.dispose();
    runtime = startRuntime({ r2Persist: state });
    assert.equal((await request(report.preview)).status, 200);
    const source = await request(`/projects/${report.revision}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(source.status, 200);
    report.checks.push('R2 source and preview survive a complete local runtime restart');
  }
  saveReport({ status: 'passed', ...report });
  for (const check of report.checks) console.log(`PASS: ${check}`);
  console.log(`Measurements saved to reports/${name}.json`);
} catch (error) {
  saveReport({ status: 'failed', error: error.message });
  throw error;
} finally {
  await runtime?.dispose();
  if (state) rmSync(state, { recursive: true, force: true });
}

function saveReport(result) {
  mkdirSync('reports', { recursive: true });
  writeFileSync(`reports/${name}.json`, JSON.stringify({
    checkedAt: new Date().toISOString(), base: base ?? 'local workerd', ...result
  }, null, 2));
}
