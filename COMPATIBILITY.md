# Upstream support and compatibility

This demo uses **Vite 8.3.5's standard build API inside a custom Worker port**.
Successful tests are evidence for the fixtures here, not an upstream support
commitment or full Vite compatibility.

## What is standard

| Capability | Upstream status |
| --- | --- |
| `vite.build()` and inline configuration | Documented Vite JavaScript API |
| Library builds and HTML application builds | Documented Vite build modes |
| `write: false`, source maps, `minify: false`, `target: 'esnext'` | Documented Vite options |
| `buildStart`, `resolveId`, plugin hooks | Documented Vite/Rolldown plugin interfaces |
| Rolldown WASM distribution | Upstream documents `wasm32-wasip1-threads` |
| `WorkerLoader.load()`, WASM modules, bindings, egress control | Documented Cloudflare APIs |

Sources: [Vite API](https://vite.dev/guide/api-javascript),
[build options](https://vite.dev/config/build-options),
[plugin API](https://vite.dev/guide/api-plugin),
[Rolldown installation](https://rolldown.rs/guide/getting-started),
[Dynamic Workers API](https://developers.cloudflare.com/dynamic-workers/api-reference/).

Vite's [Environment API](https://vite.dev/guide/api-environment) and Cloudflare's
[official Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
connect Vite to application runtimes such as workerd. They do not establish
support for executing the Vite compiler itself inside a Worker. No documented
upstream support commitment for this arrangement was found in the 2026-10-28 review.

## What is custom

The installed Vite package is untouched, but **its packaged Worker copy is
modified** by `scripts/prepare.js`:

1. Redirect `rolldown` imports to the official **@rolldown/browser 1.2.15**
   JavaScript API and substitute our own WASM loader. We compile the matching
   official Rust release using the recipe in [toolchain/README.md](toolchain/README.md).
   This satisfies Vite's `rolldown ~1.2.14` range. There is no third-party fork dependency.
2. Redirect filesystem imports to `memfs`. Vite and Rolldown share the same
   memory filesystem. This is a packaging substitution, not a Vite filesystem API.
3. Rewrite dependency `import.meta` paths into stable `/tmp/node_modules` paths.
   Copy the package metadata/client file Vite probes during initialization.
   A parser preserves string literals, and a targeted adapter protects Vite's
   preload function, which Vite serializes into browser code.
4. Extract Vite's embedded lexer WASM and import it as a Worker WASM module.
   No unsafe-eval binding or runtime WASM compilation permission is used.
5. Turn Vite's bundled CommonJS loading calls into `require()` calls that esbuild
   can bundle.

The **Rolldown source patch** registers a current-thread executor through N-API's
public [AsyncRuntime interface](https://github.com/napi-rs/napi-rs/blob/8bab46ee5dfd48a7b51e8bad3d09aed315ada4df/crates/napi/src/tokio_runtime.rs) and uses synchronous in-memory asset reads on
WASM. `toolchain/worker-runtime.rs` is the complete executor implementation.
Neither N-API nor its build helper, Tokio, emnapi, or WASI is patched.

Our **WASM loader** in `compat/rolldown.ts` supplies the precompiled WASM,
shared virtual filesystem, non-shared 64 MiB initial memory, and emnapi's async-work
and thread-safe-function plugins. Callback scheduling uses the context's feature
configuration to choose microtasks. Initialization happens inside the request;
Vite imports its binding exports afterward. `withRuntime()` alternates bounded
Rust scheduler ticks with JavaScript event-loop turns until the build settles.
There is no thread pool or global hook installed by a fork.

This uses public N-API extension points but still makes the **threadless Rolldown
build and Worker loader project-maintained integration code**. Rolldown's documented
WASM distribution uses threads. Its generated binding exports and Vite's packaging
internals can change between releases. Preparation checks the pinned Vite version,
source/binary hashes, and the actual WASM memory/import declarations.
The compatibility date remains 2026-07-30 to match local Miniflare; hosted tests
use the same date.

Native CSS tools, devtools, runtime esbuild, and optional native accelerators are
excluded from the compiler. We explicitly disable minification and use ordinary
CSS with an inline empty PostCSS configuration. Only the dependency set and
features in [VALIDATION.md](VALIDATION.md) are tested.

## Maintenance and upstream work

A platform adopting this owns the source patch, loader, and Vite adapter until
these capabilities are accepted upstream. Upgrade the official Rolldown source
and JavaScript wrapper together, check Vite's declared range, review private
binding exports and packaging transformations, then rerun the local integration,
real-browser, and hosted tests. The source build uses an exact release commit and
upstream Cargo lockfile; it does not silently track `latest`.

Potential upstream work includes a supported threadless Rolldown WASM target,
an explicit filesystem/module-loading integration, and a Vite distribution that
can import precompiled WASM without rewriting its generated internals. These are
proposed integration points, not announced upstream plans.

## Source and license

The compiler is built from official upstream packages and the project-owned
adapters described in [PROVENANCE.md](PROVENANCE.md). Upstream license notices
are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
No custom workerd binary, module fallback, experimental compatibility flag, or
host compiler service is used. See [VALIDATION.md](VALIDATION.md) for tested limits.
