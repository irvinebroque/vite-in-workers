import { validateProject } from './project.ts';

export function authorized(request: Request, token: string) {
  if (!token) return false;
  const encode = (value: string) => new TextEncoder().encode(value);
  const actual = encode(request.headers.get('authorization') ?? '');
  const expected = encode(`Bearer ${token}`);
  return actual.length === expected.length && crypto.subtle.timingSafeEqual(actual, expected);
}

export async function readProject(request: Request) {
  const project: unknown = JSON.parse(await (await readBody(request)).text());
  validateProject(project);
  return project;
}

export async function readBody(request: Request) {
  // Enforce the limit while reading, including requests without Content-Length.
  let size = 0;
  const chunks = [];
  for await (const chunk of request.body ?? []) {
    size += chunk.length;
    if (size > 512_000) throw Error('Request exceeds 512 KB.');
    chunks.push(chunk);
  }
  return new Blob(chunks);
}
