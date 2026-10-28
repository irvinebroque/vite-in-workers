// Build our WASM from a pinned official release, never from a fork or npm binary.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const upstream = JSON.parse(readFileSync('toolchain/upstream.json'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const inputs = {
  recipeSha256: sha256('toolchain/build.js'),
  patchSha256: sha256('toolchain/rolldown.patch'),
  runtimeSha256: sha256('toolchain/worker-runtime.rs')
};
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });
const browser = JSON.parse(readFileSync('node_modules/@rolldown/browser/package.json'));
const emnapi = JSON.parse(readFileSync('node_modules/emnapi/package.json'));
if (browser.version !== upstream.version || emnapi.version !== upstream.emnapi) {
  throw Error('Install the official package versions pinned in toolchain/upstream.json.');
}

run('rustup', ['toolchain', 'install', upstream.rust, '--profile', 'minimal']);
run('rustup', ['target', 'add', '--toolchain', upstream.rust, upstream.target]);
mkdirSync('work', { recursive: true });
const source = mkdtempSync(path.join(root, 'work/rolldown-source-'));
try {
  run('git', ['clone', '--quiet', '--depth', '1', '--branch', `v${upstream.version}`, upstream.repository, source]);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  if (commit !== upstream.commit) throw Error('The upstream release no longer matches the pinned commit.');
  const cargoLockSha256 = sha256(path.join(source, 'Cargo.lock'));
  run('git', ['apply', '--check', path.join(root, 'toolchain/rolldown.patch')], { cwd: source });
  run('git', ['apply', path.join(root, 'toolchain/rolldown.patch')], { cwd: source });
  copyFileSync('toolchain/worker-runtime.rs', path.join(source, 'crates/rolldown_binding/src/worker_runtime.rs'));

  run('cargo', [`+${upstream.rust}`, 'build', '--locked', '--target', upstream.target,
    '--profile', 'release-wasi', '-p', 'rolldown_binding'], {
    cwd: source,
    env: {
      ...process.env,
      // No atomics, tokio_unstable, patched crates, or threaded emnapi archive.
      RUSTFLAGS: `--remap-path-prefix=${source}=/rolldown`,
      CARGO_ENCODED_RUSTFLAGS: `--remap-path-prefix=${source}=/rolldown`,
      CARGO_TARGET_DIR: path.join(root, 'work/rolldown-target'),
      CARGO_PROFILE_RELEASE_WASI_DEBUG: '0',
      CARGO_PROFILE_RELEASE_WASI_STRIP: 'debuginfo',
      EMNAPI_LINK_DIR: path.join(root, `node_modules/emnapi/lib/${upstream.target}`)
    }
  });
  copyFileSync(`work/rolldown-target/${upstream.target}/release-wasi/rolldown_binding.wasm`, 'toolchain/rolldown.wasm');
  writeFileSync('toolchain/build.json', JSON.stringify({
    ...upstream,
    builtAt: new Date().toISOString(),
    cargoLockSha256,
    ...inputs,
    wasmSha256: sha256('toolchain/rolldown.wasm')
  }, null, 2) + '\n');
  run(process.execPath, ['toolchain/check.js']);
} finally {
  // Only remove the temporary checkout created by this invocation.
  rmSync(source, { recursive: true, force: true });
}
