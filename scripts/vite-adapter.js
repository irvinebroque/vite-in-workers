// Version-sensitive transformations used only while packaging the compiler.
import { transform } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const nodeModules = fileURLToPath(new URL('../node_modules/', import.meta.url));

// Vite normally compiles this embedded lexer at runtime; Workers imports WASM modules.
export function extractViteLexer(source, version) {
  if (version !== '8.3.5') throw new Error('Review the Vite adapter before upgrading Vite.');
  const lexer = source.match(/return A = "(AGFzb[^"]+)"/)?.[1];
  if (!lexer || !source.includes('WebAssembly.compile(C())')) {
    throw new Error('Vite lexer layout changed. Update the adapter.');
  }
  return Buffer.from(lexer, 'base64');
}

export async function adaptModule(source, filename) {
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
  const virtualPath = '/tmp/node_modules/' + path.relative(nodeModules, filename);
  return (await transform(source, { loader: 'js', target: 'es2022', charset: 'utf8', define: {
    'import.meta.url': JSON.stringify('file://' + virtualPath),
    'import.meta.dirname': JSON.stringify(path.dirname(virtualPath)),
    'import.meta.filename': JSON.stringify(virtualPath)
  } })).code;
}
