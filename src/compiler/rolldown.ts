import { instantiateNapiModule, type WASIInstance } from '@emnapi/core';
import { asyncWork, tsfn } from '@emnapi/core/plugins';
import { createContext } from '@emnapi/runtime';
import { WASI, type IFs } from '@tybys/wasm-util';
import fs from 'node:fs';
import wasm from './rolldown.wasm';

type Binding = Record<string, unknown> & { advanceWorkerTasks(budget: number): void };

let binding: Binding;
export let memory: WebAssembly.Memory;

// Called inside the request: WASI initialization needs randomness and timers.
export async function initializeRolldown() {
  memory = new WebAssembly.Memory({ initial: 1024, maximum: 65536 });
  const context = createContext({ features: { setImmediate: callback => queueMicrotask(callback), MessageChannel: undefined } });
  context.suppressDestroy();
  const { napiModule } = await instantiateNapiModule(wasm, {
    context,
    // The libraries disagree on unused readlink overloads and command-mode start().
    // This reactor uses readlinkSync(path) and synchronous WASI initialization.
    wasi: new WASI({ version: 'preview1', fs: fs as IFs, preopens: { '/tmp': '/tmp' } }) as WASIInstance,
    asyncWorkPoolSize: 0,
    plugins: [asyncWork, tsfn],
    onCreateWorker() { throw new Error('The compiler must run on one thread.'); },
    overwriteImports(imports) {
      imports.env = { ...imports.env, ...imports.napi, ...imports.emnapi, memory };
      return imports;
    },
    beforeInit({ instance }) {
      for (const [name, register] of Object.entries(instance.exports)) {
        if (name.startsWith('__napi_register__') && typeof register === 'function') register();
      }
    }
  });
  binding = napiModule.exports;
}

// Used by the generated named exports that Vite's Rolldown wrapper imports.
export function getBinding() {
  if (!binding) throw new Error('Initialize Rolldown before importing Vite.');
  return binding;
}

export async function withRuntime<T>(build: () => Promise<T>): Promise<T> {
  let done = false;
  const result = Promise.resolve().then(build);
  const settled = () => { done = true; };
  result.then(settled, settled);
  while (!done) {
    binding.advanceWorkerTasks(32);
    // Let JavaScript plugin hooks and promise callbacks run between Rust ticks.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}
