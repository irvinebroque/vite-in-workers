import runtime from './runtime.txt';
import rolldown from './rolldown.bin';
import lexer from './lexer.bin';
import page from '../public/index.html';
import example from '../prepared/example.json';
import { previewResponse } from './preview.js';
import { readProject, authorized } from './request.js';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (method === 'GET' && path === '/') {
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (method === 'GET' && path === '/example') return Response.json(example);
    if (method === 'GET' && path.startsWith('/preview/')) return previewResponse(request, env);
    if (!authorized(request, env.BUILD_TOKEN)) {
      return Response.json({ error: 'A build token is required.' }, { status: 401 });
    }

    const [, resource, id] = path.match(/^\/(projects|run)\/([\w-]+)$/) ?? [];
    if (resource === 'projects' && method === 'DELETE') {
      await env.BUILDS.delete(id);
      return new Response(null, { status: 204 });
    }
    if ((resource === 'projects' && method === 'GET') || (resource === 'run' && method === 'POST')) {
      const saved = await env.BUILDS.get(id);
      if (!saved) return new Response('Not found', { status: 404 });
      const { project, bundle } = await saved.json();
      return resource === 'projects' ? Response.json(project) : runApplication(bundle, env.LOADER);
    }
    if (path !== '/build') return new Response('Not found', { status: 404 });
    if (method !== 'POST') return new Response('Use POST.', { status: 405, headers: { Allow: 'POST' } });

    let project;
    try {
      project = await readProject(request);
    } catch (error) {
      return Response.json({ errors: [{ message: error.message }] }, { status: 400 });
    }

    try {
      // Fresh compiler: no storage bindings, network, credentials, or previous files.
      const child = env.LOADER.load({
        compatibilityDate: '2026-07-30',
        compatibilityFlags: ['nodejs_compat'],
        mainModule: 'build.js',
        modules: {
          'build.js': runtime,
          'rolldown.wasm': { wasm: rolldown },
          'lexer.wasm': { wasm: lexer }
        },
        globalOutbound: null,
        limits: { cpuMs: 30_000, subRequests: 0 }
      });
      const response = await child.getEntrypoint().fetch(new Request('https://compiler/build', {
        method: 'POST', body: JSON.stringify(project)
      }));
      if (!response.ok) return response;
      const bundle = await response.json();
      const id = crypto.randomUUID();
      const saved = new TextEncoder().encode(JSON.stringify({ project, bundle }));
      await env.BUILDS.put(id, saved);
      const hasPage = bundle.output.some(file => file.filename === 'index.html');
      return Response.json({ ...bundle, id, preview: hasPage ? `/preview/${id}/index.html` : null });
    } catch (error) {
      console.error('Build failed', String(error));
      return Response.json({ errors: [{ message: 'Compiler or storage failed. Check Worker logs.', detail: String(error) }] }, { status: 503 });
    }
  }
};

async function runApplication(bundle, loader) {
  const modules = Object.fromEntries(bundle.output
    .filter(file => file.filename.endsWith('.js'))
    .map(file => [file.filename, file.code]));
  if (!Object.hasOwn(modules, 'app.js')) return new Response('Build a Worker library entry first.', { status: 400 });

  try {
    // Application execution has its own isolate and only this explicit binding.
    const app = loader.load({
      compatibilityDate: '2026-07-30',
      mainModule: 'app.js',
      modules,
      env: { GREETING: 'Hello from a separate application Worker' },
      globalOutbound: null,
      limits: { cpuMs: 1000, subRequests: 0 }
    });
    return await app.getEntrypoint().fetch(new Request('https://app.example/'));
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 422 });
  }
}
