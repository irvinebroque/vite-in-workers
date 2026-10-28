import type { BuildOptions, InlineConfig } from 'vite';
import type { BuildResult, CompilerRequest, Diagnostic } from '../protocol.ts';
import { initializeRuntime, writeFiles } from './runtime.ts';
import { memory, withRuntime } from './rolldown.ts';
import dependencies from '../../prepared/dependencies.json';
import { restrictImports } from './imports.ts';
import { diagnostic } from './diagnostics.ts';

// The host validates input. This child only compiles; it has no platform bindings.
export default {
  async fetch(request) {
    try {
      const input = await request.json<CompilerRequest>();
      await initializeRuntime();
      writeFiles(input.files, '/tmp/app/');
      const vite = await import('vite');
      const rolldown = await import('rolldown');
      let runtime: string | undefined;
      const warnings: Diagnostic[] = [];

      const result = await withRuntime(() => vite.build({
        root: '/tmp/app',
        base: './',
        configFile: false,
        envDir: false,
        publicDir: false,
        logLevel: 'silent',
        css: { postcss: { plugins: [] } },
        plugins: [restrictImports(input.files, dependencies), {
          name: 'show-build-runtime',
          buildStart() { runtime = navigator.userAgent; }
        }],
        ...compilationOptions(input, warnings)
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

function compilationOptions(input: CompilerRequest, warnings: Diagnostic[]): Pick<InlineConfig, 'build' | 'ssr'> {
  const entry = `/tmp/app/${input.entry}`;
  const build: BuildOptions = {
    write: false,
    minify: false,
    cssMinify: false,
    sourcemap: true,
    target: 'esnext',
    assetsInlineLimit: 0,
    modulePreload: false
  };
  const onwarn: NonNullable<BuildOptions['rolldownOptions']>['onwarn'] = warning => warnings.push(diagnostic(warning));

  // A server module with its dependencies bundled for a Worker.
  if (input.target === 'server') {
    return {
      ssr: { target: 'webworker', noExternal: true },
      build: {
        ...build,
        ssr: entry,
        rolldownOptions: {
          onwarn,
          output: { entryFileNames: 'server.js', chunkFileNames: 'chunks/[name]-[hash].js', codeSplitting: true }
        }
      }
    };
  }

  // A browser app rooted in HTML, with scripts and styles discovered by Vite.
  if (entry.endsWith('.html')) {
    return { build: { ...build, rolldownOptions: { onwarn, input: entry } } };
  }

  // A standalone ES module, used by the smaller library demo.
  return {
    build: { ...build, rolldownOptions: { onwarn }, lib: { entry, formats: ['es'], fileName: 'app' } }
  };
}
