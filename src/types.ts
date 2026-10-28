export interface Project {
  entry?: string;
  files: Record<string, string>;
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
  project: Project;
  bundle: BuildResult;
}
