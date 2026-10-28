import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'vite-in-workers',
    entrypoint: '../prepared/host.js',
    compatibilityDate: '2026-07-30',
    compatibilityFlags: ['nodejs_compat'],
    env: {
      LOADER: bindings.workerLoader(),
      BUILDS: bindings.r2({ name: 'vite-in-workers-builds' }),
      BUILD_TOKEN: bindings.secret()
    },
    observability: { enabled: true }
  }
});
