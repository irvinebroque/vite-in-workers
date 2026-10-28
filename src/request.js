import { validateProject } from './project.js';

export function authorized(request, token) {
  if (!token) return false;
  const encode = value => new TextEncoder().encode(value);
  const actual = encode(request.headers.get('authorization') ?? '');
  const expected = encode(`Bearer ${token}`);
  return actual.length === expected.length && crypto.subtle.timingSafeEqual(actual, expected);
}

export async function readProject(request) {
  // Enforce the limit while reading, including requests without Content-Length.
  let size = 0;
  const chunks = [];
  for await (const chunk of request.body ?? []) {
    size += chunk.length;
    if (size > 512_000) throw Error('Request exceeds 512 KB.');
    chunks.push(chunk);
  }
  const project = JSON.parse(await new Blob(chunks).text());
  validateProject(project);
  return project;
}
