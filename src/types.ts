export interface Project {
  entry?: string;
  serverEntry?: string;
  files: Record<string, string>;
}

export interface CompilerRequest {
  entry: string;
  files: Project['files'];
  target: 'client' | 'server';
}

export interface Diagnostic {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  frame?: string;
}

export interface BuildResult {
  viteVersion: string;
  rolldownVersion: string;
  runtime?: string;
  dependencies: Record<string, string>;
  wasmMemoryBytes: number;
  warnings: Diagnostic[];
  output: { filename: string; code: string }[];
}

export interface SavedBuild {
  bundle: BuildResult;
  server?: BuildResult;
}
