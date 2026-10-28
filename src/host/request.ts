import type { Project } from '../protocol.ts';

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

// The platform supplies configuration and dependencies; users supply source files.
export function validateProject(project: unknown): asserts project is Project {
  const { files, entry = 'main.js', serverEntry } = (project ?? {}) as { files?: unknown; entry?: unknown; serverEntry?: unknown };
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw Error('Supply a files object.');
  if (typeof entry !== 'string' || !Object.hasOwn(files, entry)) throw Error('Entry must name a supplied file.');
  if (serverEntry !== undefined && (typeof serverEntry !== 'string' || !Object.hasOwn(files, serverEntry) || !/\.[jt]s$/.test(serverEntry))) {
    throw Error('Server entry must name a supplied JavaScript or TypeScript file.');
  }
  if (Object.keys(files).length > 30) throw Error('At most 30 source files are allowed.');
  for (const [name, source] of Object.entries(files)) {
    if (!/^(?:[\w-]+\/)*[\w.-]+\.(?:js|jsx|ts|tsx|json|css|html|svg)$/.test(name) ||
        name.includes('..') || name.split('/').includes('node_modules') ||
        /(?:^|\/)(?:package|tsconfig)\.json$/.test(name) || /\.config\./.test(name)) {
      throw Error(`Unsupported source path: ${name}`);
    }
    if (typeof source !== 'string' || source.length > 100_000) throw Error(`Source too large or not text: ${name}`);
  }
}
