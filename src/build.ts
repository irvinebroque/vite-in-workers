import type { BuildOptions } from 'vite';
import type { BuildResult, CompilerRequest, Diagnostic } from './types.ts';
import { initializeRuntime, writeFiles } from '../compat/runtime.ts';
import { memory, withRuntime } from '../compat/rolldown.ts';
import dependencies from '../prepared/dependencies.json';
import { restrictImports, diagnostic } from './project.ts';

// The host validates input. This child only compiles; it has no platform bindings.
export default {
  async fetch(request) {
    try {
      const project = await request.json<CompilerRequest>();
      const server = project.target === 'server';
      await initializeRuntime();
      writeFiles(project.files, '/tmp/app/');
      const vite = await import('vite');
      const rolldown = await import('rolldown');
      const entry = `/tmp/app/${project.entry}`;
      const html = entry.endsWith('.html');
      let runtime: string | undefined;
      const warnings: Diagnostic[] = [];
      const build: BuildOptions = {
        write: false,
        minify: false,
        cssMinify: false,
        sourcemap: true,
        target: 'esnext',
        assetsInlineLimit: 0,
        modulePreload: false,
        ssr: server ? entry : false,
        rolldownOptions: {
          input: html ? entry : undefined,
          output: server ? { entryFileNames: 'server.js', chunkFileNames: 'chunks/[name]-[hash].js', codeSplitting: true } : undefined,
          onwarn: warning => warnings.push(diagnostic(warning))
        },
        lib: html || server ? undefined : { entry, formats: ['es'], fileName: 'app' }
      };

      const result = await withRuntime(() => vite.build({
        root: '/tmp/app',
        base: './',
        configFile: false,
        envDir: false,
        publicDir: false,
        logLevel: 'silent',
        ssr: server ? { target: 'webworker', noExternal: true } : undefined,
        css: { postcss: { plugins: [] } },
        plugins: [restrictImports(project.files, dependencies), {
          name: 'show-build-runtime',
          buildStart() { runtime = navigator.userAgent; }
        }],
        build
      }));
      const output = [result].flat().flatMap(bundle => {
        if (!('output' in bundle)) throw Error('Expected a build result, not a watcher.');
        return bundle.output;
      });
      return Response.json({
        viteVersion: vite.version,
        rolldownVersion: rolldown.VERSION,
        runtime,
        dependencies,
        wasmMemoryBytes: memory.buffer.byteLength,
        warnings,
        output: output.map(file => {
          const contents = file.type === 'chunk' ? file.code : file.source;
          return {
            filename: file.fileName,
            code: typeof contents === 'string' ? contents : new TextDecoder().decode(contents)
          };
        })
      } satisfies BuildResult);
    } catch (error) {
      const errors = error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)
        ? error.errors : [error];
      return Response.json({ errors: errors.map(diagnostic) }, { status: 422 });
    }
  }
} satisfies ExportedHandler;
