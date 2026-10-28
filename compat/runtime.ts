import fs from './fs.cjs';
import { initializeRolldown } from './rolldown.ts';
import toolFiles from '../prepared/tool-files.json';

export async function initializeRuntime() {
  writeFiles(toolFiles);

  // Initialize WASM inside the request, before Vite imports its binding exports.
  await initializeRolldown();
}

export function writeFiles(files: Record<string, string>, prefix = '') {
  for (const [name, contents] of Object.entries(files)) {
    const filename = prefix + name;
    const directory = filename.slice(0, filename.lastIndexOf('/'));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filename, contents);
  }
}
