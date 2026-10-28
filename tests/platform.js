import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assetProject } from './fixtures.js';

export async function verifyPlatform(fetch, token) {
  const checks = [];
  const samples = [];
  const auth = { authorization: `Bearer ${token}` };
  const post = (path, body) => fetch(path, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  async function build(project) {
    const start = performance.now();
    const response = await post('/build', project);
    const text = await response.text();
    assert.equal(response.status, 200, text);
    const bundle = JSON.parse(text);
    samples.push({ entry: project.entry ?? 'main.js', milliseconds: Math.round(performance.now() - start), wasmMemoryBytes: bundle.wasmMemoryBytes });
    assert.equal(bundle.viteVersion, '8.3.5');
    assert.equal(bundle.rolldownVersion, '1.2.15');
    assert.equal(bundle.runtime, 'Cloudflare-Workers');
    return bundle;
  }
  async function rejected(project, status, message) {
    const response = await post('/build', project);
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    if (message) assert.match(JSON.stringify(body), message);
    return body;
  }
  const js = bundle => bundle.output.find(f => f.filename === 'app.js').code;
  const evaluate = async bundle => (await import('data:text/javascript;base64,' + Buffer.from(js(bundle)).toString('base64'))).default;

  assert.equal((await fetch('/build', { method: 'POST', body: '{}' })).status, 401);
  const sameLengthToken = token.slice(0, -1) + (token.endsWith('x') ? 'y' : 'x');
  for (const invalidToken of ['wrong', sameLengthToken]) {
    assert.equal((await fetch('/build', { method: 'POST', headers: { authorization: `Bearer ${invalidToken}` }, body: '{}' })).status, 401);
  }
  assert.equal((await fetch('/build', { headers: auth })).status, 405);
  assert.equal((await fetch('/unknown', { headers: auth })).status, 404);
  assert.equal((await fetch('/projects/missing', { headers: auth })).status, 404);
  assert.equal((await post('/run/missing', {})).status, 404);
  checks.push('Authentication, method checks, and routing');

  for (let i = 0; i < 2; i++) {
    const message = randomUUID();
    const bundle = await build({ files: {
      'main.js': 'import { message } from "./message.js"; export default message;',
      'message.js': `export const message = ${JSON.stringify(message)}; export const unused = "TREE_SHAKE_ME";`
    } });
    assert.ok(!js(bundle).includes('TREE_SHAKE_ME'));
    assert.equal(await evaluate(bundle), message);
    assert.equal((await fetch(`/projects/${bundle.id}`, { headers: auth })).status, 404);
    assert.equal((await post(`/run/${bundle.id}`, {})).status, 404);
  }
  checks.push('Request-time compilation, changing inputs, tree shaking, and removal of legacy endpoints');

  const typed = await build({ entry: 'main.ts', files: { 'main.ts': 'const n: number = 21; export default n * 2;' } });
  assert.equal(await evaluate(typed), 42);
  const concurrent = await Promise.all([17, 23].map(n => build({ files: { 'main.js': `export default ${n};` } })));
  assert.deepEqual(await Promise.all(concurrent.map(evaluate)), [17, 23]);
  await rejected({ files: { 'main.js': 'import { message } from "./message.js"; export default message;' } }, 422);
  checks.push('TypeScript, concurrent builds, and no files leaking between compiler isolates');

  const example = await (await fetch('/example')).json();
  const app = await build(example);
  assert.deepEqual(Object.keys(app.dependencies).sort(), ['clsx', 'react', 'react-dom', 'scheduler']);
  assert.ok(app.output.some(f => f.filename.endsWith('.css')));
  const map = JSON.parse(app.output.find(f => f.filename.endsWith('.js.map')).code);
  assert.ok(map.sources.some(name => name.endsWith('main.tsx')));
  assert.ok(map.sourcesContent.some(source => source?.includes('My task board')));
  const html = await fetch(app.preview);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy'), /sandbox allow-scripts/);
  assert.ok(html.headers.get('content-security-policy').includes(`/preview/${app.id}/api/`));
  for (const file of app.output) {
    const response = await fetch(`/preview/${app.id}/${file.filename}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), file.code);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  }
  assert.equal((await fetch(`/preview/${app.id}/missing.js`)).status, 404);
  checks.push('React/TSX, pinned npm dependencies, HTML, CSS, source maps, and served artifacts');

  assert.ok(app.server.output.some(file => file.filename === 'server.js'));
  const task = await (await fetch(app.serverUrl + 'task')).json();
  assert.equal(task.message, 'Hello from server.ts');
  assert.equal(task.runtime, 'Cloudflare-Workers');
  assert.equal(task.revision, app.id);
  assert.equal(task.title, 'My task board');
  const completed = await post(app.serverUrl + 'task', { done: true });
  assert.equal((await completed.json()).done, true);
  assert.equal((await fetch(`/preview/${app.id}/server.js`)).status, 404);
  assert.equal((await fetch(`/preview/${app.id}/server.js.map`)).status, 404);
  checks.push('Server TypeScript is compiled separately, executed for GET and POST, and not served as a client asset');

  const assets = await build(assetProject);
  assert.ok(assets.output.some(f => f.filename.endsWith('.svg')));
  assert.ok(assets.output.filter(f => f.filename.endsWith('.js')).length >= 2);
  assert.ok(assets.output.some(f => f.filename.endsWith('.css') && f.code.includes('green')));
  for (const chunk of assets.output.filter(f => f.filename.endsWith('.js'))) {
    assert.doesNotMatch(chunk.code, /file:\/\/\/tmp|import\.meta\.(?:ROLLDOWN|ROLLUP)_FILE_URL_/);
  }
  checks.push('JSON imports, SVG assets, CSS imports, and dynamic import code splitting');

  const edited = structuredClone(example);
  edited.files['title.ts'] = 'export const title = "A saved revision";';
  const revision = await build(edited);
  assert.notEqual(revision.id, app.id);
  const oldBundle = await (await fetch(`/preview/${app.id}/${app.output.find(f => f.filename.endsWith('.js')).filename}`)).text();
  assert.ok(oldBundle.includes('My task board'));
  assert.ok(!oldBundle.includes('A saved revision'));
  checks.push('Edits produce new immutable preview revisions; old previews remain unchanged');
  assert.equal((await fetch(`/builds/${revision.id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await fetch(revision.preview)).status, 200);
  assert.equal((await fetch(`/builds/${revision.id}`, { method: 'DELETE', headers: auth })).status, 204);
  assert.equal((await fetch(revision.preview)).status, 404);
  assert.equal((await fetch(revision.serverUrl + 'task')).status, 404);
  checks.push('Authenticated revision deletion removes its preview');

  const broken = await rejected({ entry: 'main.ts', files: { 'main.ts': 'const broken: = 1;' } }, 422, /Unexpected token/);
  assert.equal(broken.errors[0].file, 'main.ts');
  assert.equal(broken.errors[0].line, 1);
  assert.equal(typeof broken.errors[0].column, 'number');
  const brokenServer = await rejected({ ...example, files: { ...example.files, 'server.ts': 'const broken: = 1;' } }, 422);
  assert.equal(brokenServer.errors[0].file, 'server.ts');
  for (const serverEntry of ['missing.ts', 'index.html', 42]) await rejected({ ...example, serverEntry }, 400);
  assert.ok(!JSON.stringify(broken).includes('\\u001b'));
  for (const imported of ['not-installed', 'node:fs', 'https://example.com/app.js', '../../node_modules/vite/package.json', 'react-dom/server', 'react-dom/static']) {
    await rejected({ files: { 'main.js': `import value from ${JSON.stringify(imported)}; export default value;` } }, 422);
  }
  for (const name of ['../main.js', 'node_modules/fake.js', '/main.js', 'package.json', 'vite.config.js']) {
    await rejected({ entry: name, files: { [name]: 'export default 1;' } }, 400);
  }
  await rejected({ files: { 'main.js': ' '.repeat(100_001) } }, 400);
  await rejected({ files: { 'main.js': ' '.repeat(512_001) } }, 400);
  const invalidJSON = await fetch('/build', { method: 'POST', headers: auth, body: '{broken' });
  assert.equal(invalidJSON.status, 400);
  checks.push('File/line/column diagnostics, missing packages, disallowed imports, path checks, and bounded input');

  return { checks, samples, preview: app.preview, serverUrl: app.serverUrl, revision: app.id, dependencies: app.dependencies };
}
