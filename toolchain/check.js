// Check provenance and the actual binary, not just the target's name.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const upstream = JSON.parse(readFileSync('toolchain/upstream.json'));
if (!existsSync('toolchain/build.json') || !existsSync('toolchain/rolldown.wasm')) {
  throw Error('Run npm run build:rolldown before packaging or testing.');
}
const build = JSON.parse(readFileSync('toolchain/build.json'));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
for (const [key, value] of Object.entries(upstream)) assert.equal(build[key], value, key);
assert.equal(build.recipeSha256, hash('toolchain/build.js'), 'Rebuild after changing the recipe.');
assert.equal(build.patchSha256, hash('toolchain/rolldown.patch'), 'Rebuild after changing the patch.');
assert.equal(build.runtimeSha256, hash('toolchain/worker-runtime.rs'), 'Rebuild after changing the runtime.');
assert.equal(build.wasmSha256, hash('toolchain/rolldown.wasm'), 'WASM differs from the recorded build.');
assert.equal(JSON.parse(readFileSync('node_modules/@rolldown/browser/package.json')).version, upstream.version);

const bytes = readFileSync('toolchain/rolldown.wasm');
const module = new WebAssembly.Module(bytes);
const imports = WebAssembly.Module.imports(module);
// N-API's "threadsafe_function" API is our JS callback queue, not a thread.
assert.ok(!imports.some(i => /thread|pthread|spawn/i.test(i.name) &&
  !/^napi_(?:call|release|create|unref)_threadsafe_function$/.test(i.name)), 'Unexpected thread import');
assert.ok(!imports.some(i => /thread|pthread/i.test(i.module)), 'Unexpected thread module');
assert.ok(WebAssembly.Module.exports(module).some(e => e.name === 'napi_register_wasm_v1'));

// Decode the import section's memory limits: WebAssembly.Module.imports omits them.
let cursor = 8;
const u32 = () => {
  let value = 0, shift = 0, byte;
  do { byte = bytes[cursor++]; value += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
  return value;
};
const name = () => { const length = u32(); const text = bytes.subarray(cursor, cursor + length).toString(); cursor += length; return text; };
const limits = () => { const flags = u32(); const initial = u32(); const maximum = flags & 1 ? u32() : null; return { flags, initial, maximum }; };
let memory;
while (cursor < bytes.length) {
  const section = bytes[cursor++], length = u32(), end = cursor + length;
  if (section === 2) {
    const count = u32();
    for (let i = 0; i < count; i++) {
      const moduleName = name(), field = name(), kind = bytes[cursor++];
      if (kind === 0) u32();
      else if (kind === 1) { cursor++; limits(); }
      else if (kind === 2) { assert.equal(memory, undefined); memory = { module: moduleName, name: field, ...limits() }; }
      else if (kind === 3) cursor += 2;
      else throw Error(`Unexpected WASM import kind ${kind}`);
    }
  }
  cursor = end;
}
assert.ok(memory, 'Expected imported linear memory');
assert.equal(memory.flags & 2, 0, 'Shared memory is forbidden');
assert.ok(memory.initial <= 1024, 'Increase the reviewed memory allocation before using this binary');
mkdirSync('reports', { recursive: true });
writeFileSync('reports/rolldown-build.json', JSON.stringify({
  status: 'passed', ...build, wasmBytes: bytes.length, memory,
  imports: imports.map(i => `${i.module}.${i.name}`)
}, null, 2) + '\n');
console.log(`Verified upstream Rolldown ${upstream.version}: non-shared memory, no thread imports, matching source and WASM hashes.`);
