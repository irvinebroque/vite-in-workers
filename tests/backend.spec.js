import { test, expect } from '@playwright/test';

const headers = { authorization: `Bearer ${process.env.BUILD_TOKEN ?? 'local-demo'}` };

test('compiled server routes requests, loads chunks, and remains isolated from the host', async ({ request }) => {
  const built = await request.post('/build', { headers, data: {
    entry: 'index.html', serverEntry: 'server.ts', files: {
      'index.html': '<h1>Server test</h1>',
      'helper.ts': 'export const marker: string = "ONLY_IN_SERVER_OUTPUT";',
      'server.ts': `let calls = 0;
        export default { async fetch(request: Request, env: { REVISION: string }) {
          const url = new URL(request.url);
          if (url.pathname === '/api/throw') throw Error('Server exploded');
          if (url.pathname === '/api/redirect') return Response.redirect('https://example.com/');
          if (url.pathname === '/api/html') return new Response('<script>parent.document.body.remove()</script>', {
            headers: { 'content-type': 'text/html', 'set-cookie': 'unsafe=yes' }
          });
          const { marker } = await import('./helper');
          let networkBlocked = false;
          try { await fetch('https://example.com/'); } catch { networkBlocked = true; }
          return Response.json({
            marker, calls: ++calls, bindings: Object.keys(env), revision: env.REVISION,
            networkBlocked, runtime: navigator.userAgent, path: url.pathname, query: url.search,
            method: request.method, cookie: request.headers.get('cookie'),
            authorization: request.headers.get('authorization'),
            body: request.method === 'POST' ? await request.json() : null
          });
        } };`
    }
  } });
  expect(built.ok()).toBe(true);
  const bundle = await built.json();
  expect(bundle.server.output.filter(file => file.filename.endsWith('.js')).length).toBeGreaterThan(1);
  expect(JSON.stringify(bundle.output)).not.toContain('ONLY_IN_SERVER_OUTPUT');
  const response = await request.post(bundle.serverUrl + 'echo?value=42', {
    headers: { ...headers, cookie: 'host-secret=yes' }, data: { message: 'Request reaches server code' }
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    marker: 'ONLY_IN_SERVER_OUTPUT', calls: 1, bindings: ['REVISION'], revision: bundle.id,
    networkBlocked: true, runtime: 'Cloudflare-Workers', path: '/api/echo', query: '?value=42',
    method: 'POST', cookie: null, authorization: null, body: { message: 'Request reaches server code' }
  });
  expect((await (await request.get(bundle.serverUrl + 'echo')).json()).calls).toBe(1);
  const preflight = await request.fetch(bundle.serverUrl + 'echo', { method: 'OPTIONS', headers: {
    origin: 'null', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type'
  } });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()['access-control-allow-origin']).toBe('*');
  expect(preflight.headers()['access-control-allow-credentials']).toBeUndefined();
  const failed = await request.get(bundle.serverUrl + 'throw');
  expect(failed.status()).toBe(502);
  expect((await failed.json()).error).toContain('Server exploded');
  expect((await request.get(bundle.serverUrl + 'redirect', { maxRedirects: 0 })).status()).toBe(502);
  const html = await request.get(bundle.serverUrl + 'html');
  expect(html.headers()['set-cookie']).toBeUndefined();
  expect(html.headers()['content-security-policy']).toContain("sandbox; default-src 'none'");
  expect((await request.post(bundle.serverUrl + 'echo', { data: ' '.repeat(512_001) })).status()).toBe(413);
});

test('server execution failures are visible in the browser preview', async ({ page, request }) => {
  const example = await (await request.get('/example')).json();
  example.files['server.ts'] = 'export default { fetch() { throw Error("Visible server error"); } };';
  const built = await request.post('/build', { headers, data: example });
  expect(built.ok()).toBe(true);
  await page.goto((await built.json()).preview);
  await expect(page.getByRole('alert')).toContainText('Visible server error');
});
