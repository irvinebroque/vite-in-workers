import { readFileSync } from 'node:fs';
import { startRuntime } from './runtime.js';

const runtime = startRuntime();
const backend = process.argv.includes('--backend');
const project = backend ? {
  files: { 'main.js': 'export default { fetch(request, env) { return Response.json({ message: env.GREETING }); } };' }
} : JSON.parse(readFileSync(new URL('../example.json', import.meta.url), 'utf8'));

async function post(path, body) {
  const response = await runtime.dispatchFetch(`http://demo${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer local-demo' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw Error(text);
  return JSON.parse(text);
}

try {
  const bundle = await post('/build', project);
  console.log(JSON.stringify(backend ? await post(`/run/${bundle.id}`) : bundle, null, 2));
} finally {
  await runtime.dispose();
}
