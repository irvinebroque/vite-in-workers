// Packages Vite itself for Workers. Submitted application code is not built here.
import { build, transform } from 'esbuild';
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
if (version !== '8.3.5') throw new Error('Review the compatibility adapter before upgrading Vite.');

// Vite normally compiles this embedded lexer WASM at runtime. Workers needs an
// imported WASM module instead. Extract it once, when packaging the toolchain.
const viteSource = readFileSync('node_modules/vite/dist/node/chunks/node.js', 'utf8');
const lexer = viteSource.match(/return A = "(AGFzb[^"]+)"/)?.[1];
if (!lexer || !viteSource.includes('WebAssembly.compile(C())')) {
  throw new Error('Vite lexer layout changed. Update the adapter.');
}
writeFileSync('prepared/lexer.bin', Buffer.from(lexer, 'base64'));
copyFileSync('toolchain/rolldown.wasm', 'prepared/rolldown.bin');

// Keep the published JavaScript API, supplying our own single-threaded binding.
const rolldownDir = path.dirname(require.resolve('@rolldown/browser/package.json'));
const rolldownPackage = JSON.parse(readFileSync(path.join(rolldownDir, 'package.json')));
const browserBinding = readFileSync(path.join(rolldownDir, 'dist/rolldown-binding.wasi-browser.js'), 'utf8');
const exports = [...browserBinding.matchAll(/export const (\w+) = __napiModule.exports\./g)].map(match => match[1]);
if (!exports.includes('BindingBundler')) throw Error('Review the Rolldown binding exports.');
writeFileSync('prepared/binding.js', 'import { getBinding } from "../compat/rolldown.ts";\nconst binding = getBinding();\n' +
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
    if (/\.(?:js|mjs|json)$/.test(filename)) {
      toolFiles[`/tmp/app/node_modules/${name}/${filename}`] = readFileSync(path.join(directory, filename), 'utf8');
    }
  }
}
writeFileSync('prepared/dependencies.json', JSON.stringify(dependencies, null, 2));
writeFileSync('prepared/tool-files.json', JSON.stringify(toolFiles));

const example = {
  entry: 'index.html',
  files: Object.fromEntries(readdirSync('examples/react').map(name => [name, readFileSync(`examples/react/${name}`, 'utf8')]))
};
writeFileSync('prepared/example.json', JSON.stringify(example, null, 2));

await build({
  entryPoints: ['src/build.ts'],
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
      bundler.onResolve({ filter: /^(?:node:)?fs(?:\/promises)?$/ }, ({ path: name }) => ({
        path: path.join(root, 'compat', name.endsWith('/promises') ? 'fs-promises.cjs' : 'fs.cjs')
      }));
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

// Package the platform shell too. This never compiles the example application.
await build({
  entryPoints: ['src/host.ts'], outfile: 'prepared/host.js',
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  external: ['./runtime.txt', './rolldown.bin', './lexer.bin'],
  loader: { '.html': 'text' }
});

async function adaptModule(source, filename) {
  // Vite serializes this function into browser code. Preserve its import.meta
  // using the placeholder that Vite's getPreloadCode() already restores.
  if (filename.endsWith('/vite/dist/node/chunks/node.js')) {
    const start = source.indexOf('function preload(baseModule, deps, importerUrl)');
    const end = source.indexOf('function getPreloadCode(', start);
    if (start < 0 || end < 0) throw Error('Review the Vite browser-preload adapter.');
    source = source.slice(0, start) + source.slice(start, end).replaceAll('import.meta', '𝐢𝐦𝐩𝐨𝐫𝐭.meta') + source.slice(end);
  }
  if (source.includes('WebAssembly.compile(C())')) {
    source = 'import lexerWasm from "./lexer.wasm";\n' +
      source.replace('WebAssembly.compile(C())', 'Promise.resolve(lexerWasm)');
  }

  // Expose Vite's bundled CommonJS imports so esbuild can include them.
  source = source.replace(/\b__require\((['"])/g, 'require($1');

  // Use a parser so strings containing generated application code stay untouched.
  if (!source.includes('import.meta')) return source;
  const virtualPath = '/tmp/node_modules/' + path.relative(path.join(root, 'node_modules'), filename);
  return (await transform(source, { loader: 'js', target: 'es2022', charset: 'utf8', define: {
    'import.meta.url': JSON.stringify('file://' + virtualPath),
    'import.meta.dirname': JSON.stringify(path.dirname(virtualPath)),
    'import.meta.filename': JSON.stringify(virtualPath)
  } })).code;
}
