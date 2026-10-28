import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'vite-in-workers',
    entrypoint: './src/host.ts',
    compatibilityDate: '2026-10-23',
    env: {
      LOADER: bindings.workerLoader(),
      BUILDS: bindings.r2({ name: 'vite-in-workers-builds' }),
      BUILD_TOKEN: bindings.secret()
    },
    observability: { enabled: true }
  }
});
