import type { BuildResult, CompilerRequest, Project, SavedBuild } from './types.ts';
import runtime from '../prepared/runtime.txt';
import rolldown from '../prepared/rolldown.bin';
import lexer from '../prepared/lexer.bin';
import page from '../public/index.html';
import example from '../prepared/example.json';
import { previewResponse } from './preview.ts';
import { readProject, authorized } from './request.ts';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (method === 'GET' && path === '/') {
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (method === 'GET' && path === '/example') return Response.json(example);
    if (path.startsWith('/preview/')) return previewResponse(request, env);
    if (!authorized(request, env.BUILD_TOKEN)) {
      return Response.json({ error: 'A build token is required.' }, { status: 401 });
    }

    const id = path.match(/^\/builds\/([\w-]+)$/)?.[1];
    if (id && method === 'DELETE') {
      await env.BUILDS.delete(id);
      return new Response(null, { status: 204 });
    }
    if (path !== '/build') return new Response('Not found', { status: 404 });
    if (method !== 'POST') return new Response('Use POST.', { status: 405, headers: { Allow: 'POST' } });

    let project;
    try {
      project = await readProject(request);
    } catch (error) {
      return Response.json({ errors: [{ message: error instanceof Error ? error.message : String(error) }] }, { status: 400 });
    }

    try {
      const response = await compile(project, project.entry ?? 'main.js', 'client', env.LOADER);
      if (!response.ok) return response;
      const bundle = await response.json<BuildResult>();
      let server: BuildResult | undefined;
      if (project.serverEntry) {
        const response = await compile(project, project.serverEntry, 'server', env.LOADER);
        if (!response.ok) return response;
        server = await response.json<BuildResult>();
      }
      const id = crypto.randomUUID();
      const saved = new TextEncoder().encode(JSON.stringify({ bundle, server } satisfies SavedBuild));
      await env.BUILDS.put(id, saved);
      const hasPage = bundle.output.some(file => file.filename === 'index.html');
      return Response.json({ ...bundle, server, id, preview: hasPage ? `/preview/${id}/index.html` : null, serverUrl: server ? `/preview/${id}/api/` : null });
    } catch (error) {
      console.error('Build failed', String(error));
      return Response.json({ errors: [{ message: 'Compiler or storage failed. Check Worker logs.', detail: String(error) }] }, { status: 503 });
    }
  }
} satisfies ExportedHandler<Env>;

async function compile(project: Project, entry: string, target: CompilerRequest['target'], loader: WorkerLoader) {
  // Each target gets a fresh compiler so build state cannot leak between targets.
  const child = loader.load({
    compatibilityDate: '2026-10-23',
    mainModule: 'build.js',
    modules: {
      'build.js': runtime,
      'rolldown.wasm': { wasm: rolldown },
      'lexer.wasm': { wasm: lexer }
    },
    globalOutbound: null,
    limits: { cpuMs: 30_000, subRequests: 0 }
  });
  return child.getEntrypoint().fetch(new Request('https://compiler/build', {
    method: 'POST', body: JSON.stringify({ entry, files: project.files, target } satisfies CompilerRequest)
  }));
}
