// The platform supplies configuration and dependencies; users supply source files.
export function validateProject(project) {
  const { files, entry = 'main.js' } = project ?? {};
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw Error('Supply a files object.');
  if (typeof entry !== 'string' || !Object.hasOwn(files, entry)) throw Error('Entry must name a supplied file.');
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

export function restrictImports(files, dependencies) {
  return {
    name: 'fixed-dependencies',
    enforce: 'pre',
    resolveId(id, importer) {
      // Only police user modules. Vite and the approved packages have their own imports.
      if (!importer?.startsWith('/tmp/app/') || importer.includes('/node_modules/')) return;
      if (id.startsWith('\0') || id.startsWith('vite/')) return;
      if (id.startsWith('.') || id.startsWith('/')) {
        const resolved = new URL(id, `file://${importer}`).pathname;
        const filename = resolved.replace(/^\/tmp\/app\//, '');
        if (resolved.startsWith('/tmp/app/') && !filename.split('/').includes('node_modules')) return;
        if (id.startsWith('/') && Object.hasOwn(files, id.slice(1))) return;
        throw Error(`Import must stay inside the project: ${id}`);
      }
      const packageName = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0];
      if (!Object.hasOwn(dependencies, packageName)) throw Error(`Package is not installed: ${id}`);
    }
  };
}

export function diagnostic(error) {
  const location = error.loc ?? error.location;
  const message = (error.message ?? String(error)).replace(/\u001b\[[0-9;]*m/g, '');
  const renderedLocation = message.match(/tmp\/app\/([^:\n]+):(\d+):(\d+)/);
  return {
    message,
    file: (location?.file ?? error.id ?? renderedLocation?.[1])?.replace(/^\/tmp\/app\//, ''),
    line: location?.line ?? (renderedLocation ? Number(renderedLocation[2]) : undefined),
    column: location?.column ?? (renderedLocation ? Number(renderedLocation[3]) - 1 : undefined),
    frame: error.frame?.replace(/\u001b\[[0-9;]*m/g, '')
  };
}
