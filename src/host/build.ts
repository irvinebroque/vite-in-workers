import type { BuildResult, CompiledProject, CompilerRequest, Project } from '../protocol.ts';
import runtime from '../../prepared/runtime.txt';
import rolldown from '../../prepared/rolldown.bin';
import lexer from '../../prepared/lexer.bin';
import { readProject } from './request.ts';

// Preserve the existing R2 format. Inside the host, this field is named client.
export interface StoredRevision {
  bundle: BuildResult;
  server?: BuildResult;
}

export async function buildResponse(request: Request, env: Env) {
  let project;
  try {
    project = await readProject(request);
  } catch (error) {
    return Response.json({ errors: [{ message: error instanceof Error ? error.message : String(error) }] }, { status: 400 });
  }

  try {
    const response = await compile(project, project.entry ?? 'main.js', 'client', env.LOADER);
    if (!response.ok) return response;
    const compiled: CompiledProject = { client: await response.json<BuildResult>() };
    if (project.serverEntry) {
      const response = await compile(project, project.serverEntry, 'server', env.LOADER);
      if (!response.ok) return response;
      compiled.server = await response.json<BuildResult>();
    }
    const { client, server } = compiled;
    const id = crypto.randomUUID();
    const revision = new TextEncoder().encode(JSON.stringify({ bundle: client, server } satisfies StoredRevision));
    await env.BUILDS.put(id, revision);
    const hasPage = client.output.some(file => file.filename === 'index.html');
    // Keep the public response's client fields at the top level.
    return Response.json({ ...client, server, id, preview: hasPage ? `/preview/${id}/index.html` : null, serverUrl: server ? `/preview/${id}/api/` : null });
  } catch (error) {
    console.error('Build failed', String(error));
    return Response.json({ errors: [{ message: 'Compiler or storage failed. Check Worker logs.', detail: String(error) }] }, { status: 503 });
  }
}

async function compile(project: Project, entry: string, target: CompilerRequest['target'], loader: WorkerLoader) {
  // Each target gets a fresh compiler so build state cannot leak between targets.
  const child = loader.load({
    compatibilityDate: '2026-10-23',
    mainModule: 'build.js',
    modules: {
      'build.js': runtime,
      'rolldown.wasm': { wasm: rolldown },
      'lexer.wasm': { wasm: lexer }
    },
    globalOutbound: null,
    limits: { cpuMs: 30_000, subRequests: 0 }
  });
  return child.getEntrypoint().fetch(new Request('https://compiler/build', {
    method: 'POST', body: JSON.stringify({ entry, files: project.files, target } satisfies CompilerRequest)
  }));
}
