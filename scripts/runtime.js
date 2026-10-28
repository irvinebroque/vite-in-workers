import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export function startRuntime(options = {}) {
  return new Miniflare({
    modulesRoot: root,
    modules: [
      { type: 'ESModule', path: root + 'prepared/host.js' },
      ...['runtime.txt', 'rolldown.bin', 'lexer.bin'].map(name => ({
        type: name.endsWith('.txt') ? 'Text' : 'Data',
        path: root + 'prepared/' + name,
        contents: readFileSync(root + 'prepared/' + name)
      }))
    ],
    compatibilityDate: '2026-07-30',
    compatibilityFlags: ['nodejs_compat'],
    workerLoaders: { LOADER: {} },
    r2Buckets: ['BUILDS'],
    bindings: { BUILD_TOKEN: 'local-demo' },
    ...options
  });
}
