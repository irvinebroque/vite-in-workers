import type { Plugin } from 'vite';
import type { Project } from '../protocol.ts';

export function restrictImports(files: Project['files'], dependencies: Record<string, string>): Plugin {
  return {
    name: 'fixed-dependencies',
    enforce: 'pre',
    resolveId(id, importer) {
      // Only police user modules. Vite and the approved packages have their own imports.
      if (!importer?.startsWith('/tmp/app/') || importer.includes('/node_modules/')) return;
      if (id.startsWith('\0') || id.startsWith('vite/')) return;
      if (id.startsWith('.') || id.startsWith('/')) {
        const resolved = new URL(id, `file://${importer}`).pathname;
        const filename = resolved.replace(/^\/tmp\/app\//, '');
        if (resolved.startsWith('/tmp/app/') && !filename.split('/').includes('node_modules')) return;
        if (id.startsWith('/') && Object.hasOwn(files, id.slice(1))) return;
        throw Error(`Import must stay inside the project: ${id}`);
      }
      const packageName = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0];
      if (!Object.hasOwn(dependencies, packageName)) throw Error(`Package is not installed: ${id}`);
      if (/^react-dom\/(?:server|static)(?:[.?/]|$)/.test(id)) {
        throw Error(`React DOM server/static entrypoints are not included: ${id}`);
      }
    }
  };
}
