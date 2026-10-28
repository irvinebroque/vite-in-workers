# Build Rolldown from upstream

```sh
npm ci
npm run build:rolldown
npm run test:all
```

Requirements: Node 24.22.0, Git, rustup, network access, and several GB of build
space. The script installs Rust 1.99.0 and its `wasm32-wasip1` target. It uses
Rust's bundled WASI linker and the official `emnapi` npm package's single-threaded
static library; no separate WASI SDK, Docker, nightly Rust, or fork is needed.
Development and deployment use the resulting WASM without rerunning Cargo.

`upstream.json` pins **Rolldown 1.2.15**, the latest stable release checked on
2026-10-28, and its full official Git commit. This version satisfies Vite 8.3.5's
`~1.2.14` dependency. The JavaScript wrapper comes from the official
`@rolldown/browser` package at exactly the same version. Its bundled WASM is
never used: we compile ours from Rust source.

The build checks the release commit, applies `rolldown.patch` with `git apply`,
copies `worker-runtime.rs` into the binding crate, and runs Cargo with the
upstream lockfile and `--locked`. An incompatible upstream change fails the
build. Temporary source checkouts are removed; Cargo artifacts stay in
`work/rolldown-target/` for inspection and caching.

## The two source changes

1. Register a custom N-API async runtime. `worker-runtime.rs` implements the
   public `napi::bindgen_prelude::AsyncRuntime` interface using Tokio's
   current-thread executor. An `advanceWorkerTasks` export polls a self-waking root future
   a fixed number of times. `compat/rolldown.ts` calls it between JavaScript event-loop turns so
   asynchronous Vite plugins can finish without spawning OS/browser threads.
2. Read emitted assets synchronously on WASM. Tokio's asynchronous filesystem
   uses a blocking thread pool; our filesystem is already in memory. Native
   targets retain the upstream asynchronous implementation.

The root future uses Rust’s `poll_fn` and `Waker::wake_by_ref` to return control
after a fixed number of polls. It does not spawn a keepalive task. It rejects blocking runtime calls, which could
deadlock this execution model. This is a build-only port: watch/devtools and
other thread-dependent paths are not enabled or claimed to work.

There are **no patches to napi, napi-build, Tokio, emnapi, or the WASI library**.
The bridge uses the official emnapi 2.0.0-alpha.5 packages pinned by this Rolldown
release. The transitive `@napi-rs/wasm-runtime` package stays at 1.2.5 to match
those peers; our loader imports emnapi and WASI directly.

## Generated files and verification

- `toolchain/rolldown.wasm`: locally compiled artifact, ignored by Git.
- `toolchain/build.json`: source/recipe/patch/runtime/binary hashes, also ignored.
- `reports/rolldown-build.json`: checked provenance, memory limits, and imports.

`npm run check:toolchain` checks those hashes against the current source inputs,
checks the wrapper version, and parses the actual WASM import section to reject
shared memory or thread imports. `prepare:runtime` runs the same check before
packaging, so an outdated or missing artifact requires a rebuild. Hashes detect
accidental mismatches; they are not an independent build attestation.

Vite builds submitted applications inside the Worker. Cargo and esbuild only
prepare the compiler on the developer's machine. The compiler uses non-shared
memory, starts at 64 MiB, and can grow. The host creates a fresh isolate for each
build, so this loader deliberately has no reusable-session lifecycle.

## Updating

1. Check `npm view rolldown version` and the official release tag/commit. Check
   the installed Vite package's Rolldown range before selecting a release.
2. Update `upstream.json`, `@rolldown/browser`, and the matching emnapi packages.
   Use the release's Rust toolchain and lockfile. Review `rolldown.patch` against
   the new source, especially runtime lifecycle and asset reads.
3. Run `npm run build:rolldown`, `npm run test:all`, and both CLI demos. Review
   the new import/memory report, package sizes, and dependency audits.
4. Deploy using `cf`; rerun hosted integration and Chromium tests before claiming
   support. Update the expected versions in tests and the validation report.

The pin is intentional: the build never silently follows `main` or `latest`.
This project owns its small upstream patch and Worker loader. Owning the build
removes the third-party fork dependency; it does not establish upstream support
for Vite running inside Workers. See [../COMPATIBILITY.md](../COMPATIBILITY.md).

## Source and license

The build inputs are the official release, official dependency packages, and the
source files in this directory. [../PROVENANCE.md](../PROVENANCE.md) maps the
adapters to their upstream interfaces. [../THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)
records the retained notices and the obligations for distributing generated bundles.
