import page from '../../public/index.html';
import example from '../../prepared/example.json';
import { previewResponse } from './preview.ts';
import { buildResponse } from './build.ts';
import { authorized } from './request.ts';

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

    return buildResponse(request, env);
  }
} satisfies ExportedHandler<Env>;
