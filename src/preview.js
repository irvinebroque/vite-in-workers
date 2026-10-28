const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', map: 'application/json', svg: 'image/svg+xml' };

export async function previewResponse(request, env) {
  const url = new URL(request.url);
  const [, , id, ...segments] = url.pathname.split('/');
  if (!/^[\w-]+$/.test(id)) return new Response('Not found', { status: 404 });
  const saved = await env.BUILDS.get(id);
  if (!saved) return new Response('Not found', { status: 404 });
  const { bundle } = await saved.json();
  const filename = segments.join('/') || 'index.html';
  const file = bundle.output.find(file => file.filename === filename);
  if (!file) return new Response('Not found', { status: 404 });
  const type = types[filename.split('.').pop()] ?? 'text/plain';
  const base = `${url.origin}/preview/${id}/`;
  const policy = [
    'sandbox allow-scripts',
    "default-src 'none'",
    `script-src ${base}`,
    `style-src ${base} 'unsafe-inline'`,
    `img-src ${base} data:`,
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ');
  return new Response(file.code, { headers: {
    'content-type': `${type}; charset=utf-8`,
    'x-content-type-options': 'nosniff',
    // Modules requested by an opaque sandbox origin need CORS. No credentials.
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=31536000, immutable',
    'referrer-policy': 'no-referrer',
    // Also protects direct navigation to a preview, not just our iframe.
    'content-security-policy': policy
  } });
}
