// Source submitted to the host. Configuration and dependencies are supplied by the platform.
export interface Project {
  entry?: string;
  serverEntry?: string;
  files: Record<string, string>;
}

// One target sent to a fresh compiler Worker.
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

// Internal result: both targets must succeed before the host saves a revision.
export interface CompiledProject {
  client: BuildResult;
  server?: BuildResult;
}
