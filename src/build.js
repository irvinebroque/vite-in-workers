import { initializeRuntime, writeFiles } from '../compat/runtime.js';
import { memory, withRuntime } from '../compat/rolldown.js';
import dependencies from '../prepared/dependencies.json';
import { restrictImports, diagnostic } from './project.js';

// The host validates input. This child only compiles; it has no platform bindings.
export default {
  async fetch(request) {
    try {
      const project = await request.json();
      await initializeRuntime();
      writeFiles(project.files, '/tmp/app/');
      const vite = await import('vite');
      const rolldown = await import('rolldown');
      const entry = `/tmp/app/${project.entry ?? 'main.js'}`;
      let runtime;
      const warnings = [];
      const build = {
        write: false,
        minify: false,
        cssMinify: false,
        sourcemap: true,
        target: 'esnext',
        assetsInlineLimit: 0,
        modulePreload: false,
        rolldownOptions: { onwarn: warning => warnings.push(diagnostic(warning)) }
      };
      if (entry.endsWith('.html')) build.rolldownOptions.input = entry;
      else build.lib = { entry, formats: ['es'], fileName: 'app' };

      const result = await withRuntime(() => vite.build({
        root: '/tmp/app',
        base: './',
        configFile: false,
        envDir: false,
        publicDir: false,
        logLevel: 'silent',
        css: { postcss: { plugins: [] } },
        plugins: [restrictImports(project.files, dependencies), {
          name: 'show-build-runtime',
          buildStart() { runtime = navigator.userAgent; }
        }],
        build
      }));
      const output = [result].flat().flatMap(bundle => bundle.output);
      return Response.json({
        viteVersion: vite.version,
        rolldownVersion: rolldown.VERSION,
        runtime,
        dependencies,
        wasmMemoryBytes: memory.buffer.byteLength,
        warnings,
        output: output.map(file => {
          const contents = file.code ?? file.source;
          return {
            filename: file.fileName,
            code: typeof contents === 'string' ? contents : new TextDecoder().decode(contents)
          };
        })
      });
    } catch (error) {
      return Response.json({ errors: (error.errors ?? [error]).map(diagnostic) }, { status: 422 });
    }
  }
};
