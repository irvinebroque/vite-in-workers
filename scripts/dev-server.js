import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(import.meta.resolve('cf/package.json')).replace(/package\.json$/, 'bin/cf');

// Tests and demos run the same cf command and configuration as local development.
export async function startDevServer({ state } = {}) {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [cli, 'dev'], {
    cwd: root,
    env: { ...process.env, TEST_PORT: String(port), ...(state ? { TEST_STATE_DIR: state } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  let output = '', failure;
  const capture = chunk => { output = (output + chunk).slice(-16_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', error => { failure = error; });
  const exited = new Promise(resolve => child.once('exit', resolve));
  async function stop() {
    if (!child.pid) return;
    const signal = name => {
      try { process.kill(-child.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    signal('SIGTERM');
    const timeout = setTimeout(() => signal('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timeout); }
  }
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (failure || child.exitCode !== null || child.signalCode !== null) throw failure ?? Error('cf dev exited');
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        return { base, stop };
      } catch {}
      await delay(100);
    }
    throw Error('Timed out starting cf dev');
  } catch (error) {
    await stop();
    throw new Error(`${error.message}\n${output}`, { cause: error });
  }
}
