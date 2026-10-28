// Packages Vite itself for Workers. Submitted application code is not built here.
import { build } from 'esbuild';
import { adaptModule, extractViteLexer } from './vite-adapter.js';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../toolchain/check.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
process.chdir(root);
mkdirSync('prepared', { recursive: true });

const vitePackage = readFileSync('node_modules/vite/package.json', 'utf8');
const version = JSON.parse(vitePackage).version;

const viteSource = readFileSync('node_modules/vite/dist/node/chunks/node.js', 'utf8');
writeFileSync('prepared/lexer.bin', extractViteLexer(viteSource, version));
copyFileSync('toolchain/rolldown.wasm', 'prepared/rolldown.bin');

// Keep the published JavaScript API, supplying our own single-threaded binding.
const rolldownDir = path.dirname(require.resolve('@rolldown/browser/package.json'));
const rolldownPackage = JSON.parse(readFileSync(path.join(rolldownDir, 'package.json')));
const browserBinding = readFileSync(path.join(rolldownDir, 'dist/rolldown-binding.wasi-browser.js'), 'utf8');
const exports = [...browserBinding.matchAll(/export const (\w+) = __napiModule.exports\./g)].map(match => match[1]);
if (!exports.includes('BindingBundler')) throw Error('Review the Rolldown binding exports.');
writeFileSync('prepared/binding.js', 'import { getBinding } from "../src/compiler/rolldown.ts";\nconst binding = getBinding();\n' +
  exports.map(name => `export const ${name} = binding.${name};`).join('\n'));

// Vite reads its package metadata and probes this client file during startup,
// even for a build without a dev server. Put the real files in the virtual FS.
const toolFiles = {
  '/tmp/app/package.json': '{"type":"module"}',
  '/tmp/node_modules/vite/package.json': vitePackage,
  '/tmp/node_modules/vite/dist/client/client.mjs': readFileSync('node_modules/vite/dist/client/client.mjs', 'utf8')
};

// A fixed, reviewed package set. No package manager or install scripts run in Workers.
const dependencies = {};
for (const name of ['react', 'react-dom', 'scheduler', 'clsx']) {
  const directory = path.join(root, 'node_modules', name);
  dependencies[name] = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).version;
  for (const filename of readdirSync(directory, { recursive: true })) {
    // The fixed package set supports browser apps, not React server rendering.
    if (name === 'react-dom' && /server|static/.test(filename)) continue;
    if (/\.(?:js|mjs|json)$/.test(filename)) {
      toolFiles[`/tmp/app/node_modules/${name}/${filename}`] = readFileSync(path.join(directory, filename), 'utf8');
    }
  }
}
writeFileSync('prepared/dependencies.json', JSON.stringify(dependencies, null, 2));
writeFileSync('prepared/tool-files.json', JSON.stringify(toolFiles));

const example = {
  entry: 'index.html',
  serverEntry: 'server.ts',
  files: Object.fromEntries(readdirSync('examples/full-stack').map(name => [name, readFileSync(`examples/full-stack/${name}`, 'utf8')]))
};
writeFileSync('prepared/example.json', JSON.stringify(example, null, 2));

await build({
  entryPoints: ['src/compiler/worker.ts'],
  outfile: 'prepared/runtime.txt',
  bundle: true,
  format: 'esm',
  charset: 'utf8',
  platform: 'node',
  target: 'es2022',
  conditions: ['node', 'import', 'default'],
  mainFields: ['module', 'main'],
  external: [
    // These optional capabilities are outside this JS/TS build demo.
    '@vitejs/devtools/*', 'lightningcss', 'esbuild', 'fsevents', 'bufferutil', 'utf-8-validate'
  ],
  banner: {
    js: 'import { createRequire as workerRequire } from "node:module"; const require = workerRequire("/build.js");'
  },
  plugins: [{
    name: 'vite-in-workers',
    setup(bundler) {
      bundler.onResolve({ filter: /rolldown-binding\.wasi(?:-browser\.js|\.cjs)$/ }, () => ({
        path: path.join(root, 'prepared/binding.js')
      }));
      bundler.onResolve({ filter: /^rolldown(?:\/.*)?$/ }, ({ path: name }) => {
        const entry = rolldownPackage.exports[name.replace(/^rolldown/, '.')];
        return { path: path.join(rolldownDir, typeof entry === 'string' ? entry : entry.browser ?? entry.default) };
      });
      bundler.onResolve({ filter: /\.wasm$/ }, ({ path }) => ({ path, external: true }));
      bundler.onLoad({ filter: /\.[cm]?js$/ }, async ({ path: filename }) => ({
        contents: await adaptModule(readFileSync(filename, 'utf8'), filename),
        loader: 'js',
        resolveDir: path.dirname(filename)
      }));
    }
  }]
});
console.log(`Packaged Vite ${version}. Application builds will run inside Workers.`);
