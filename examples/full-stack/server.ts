import { title } from './title';

// Compiled by Vite's server build and executed in a separate Dynamic Worker.
export default {
  async fetch(request: Request, env: { REVISION: string }) {
    if (new URL(request.url).pathname !== '/api/task') return new Response('Not found', { status: 404 });
    if (!['GET', 'POST'].includes(request.method)) return new Response('Use GET or POST.', { status: 405 });
    const done = request.method === 'POST' && (await request.json<{ done: boolean }>()).done === true;
    return Response.json({
      title,
      done,
      label: done ? '✓ Shipped my first app' : 'Ship my first app',
      message: 'Hello from server.ts',
      runtime: navigator.userAgent,
      revision: env.REVISION
    });
  }
};
