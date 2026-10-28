import type { BuildResult } from './types.ts';
import { readBody } from './request.ts';

export async function applicationResponse(request: Request, server: BuildResult, id: string, loader: WorkerLoader) {
  // Preview APIs are public by revision URL. Never forward host credentials or cookies.
  const headers = new Headers({
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer'
  });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  let body;
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') body = await readBody(request);
  } catch (error) {
    return new Response(String(error), { status: 413, headers });
  }
  try {
    const app = loader.load({
      compatibilityDate: '2026-10-23',
      mainModule: 'server.js',
      modules: Object.fromEntries(server.output.filter(file => file.filename.endsWith('.js'))
        .map(file => [file.filename, file.code])),
      env: { REVISION: id },
      globalOutbound: null,
      limits: { cpuMs: 1000, subRequests: 0 }
    });
    const url = new URL(request.url);
    const forwardedHeaders = new Headers();
    for (const name of ['content-type', 'accept']) {
      const value = request.headers.get(name);
      if (value) forwardedHeaders.set(name, value);
    }
    const response = await app.getEntrypoint().fetch(new Request(
      'https://app.example' + url.pathname.slice(`/preview/${id}`.length) + url.search,
      { method: request.method, headers: forwardedHeaders, body, redirect: 'manual' }
    ));
    // Do not let generated responses set host cookies, redirect, or run unsandboxed HTML.
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return new Response('Preview APIs do not support redirects.', { status: 502, headers });
    }
    headers.set('content-type', response.headers.get('content-type') ?? 'text/plain; charset=utf-8');
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify({ error: `Server execution failed: ${String(error)}` }), { status: 502, headers });
  }
}
