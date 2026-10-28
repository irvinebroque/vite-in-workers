# Using this in a coding platform

The reusable unit is a build request: `{ entry, files }` goes in; generated files
and structured diagnostics come out. The platform owns the compiler configuration
and package set. The user or coding agent supplies source files.

## The complete flow

1. The editor keeps a draft in localStorage. An agent could send the same file map.
2. The host authenticates the request and reads at most 512,000 bytes.
3. A new Dynamic Worker receives the packaged compiler and source. It gets no
   R2 binding, build token, application credentials, or outbound network access.
   `WorkerLoader.load()` creates it directly, without caching an isolate by ID.
4. Vite reads an in-memory filesystem and performs a production build. Application
   source is parsed and transformed here, not executed as the application.
5. The host writes `{ project, bundle }` to R2 under a random revision ID.
6. `/preview/<id>/index.html` serves the resulting HTML and its relative assets.
   The browser executes the frontend in a sandboxed iframe. A CSP sandbox header
   also applies when someone opens the preview directly.
7. An edit creates a new revision. A failed build leaves the previous preview alone.

The sandbox has scripts enabled but not same-origin privileges, forms, popups,
top navigation, or network connections. Artifact responses allow credential-free
CORS so an opaque sandbox origin can load ES modules. The browser test checks
parent DOM access, localStorage access, and fetch rejection. For a production
platform, use a separate preview domain and review the desired app permissions.

## Dependency model

The preparation script copies the installed runtime source for:

| Package | Version | Why |
| --- | --- | --- |
| react | 19.3.1 | Components and state |
| react-dom | 19.3.1 | Browser rendering |
| scheduler | 0.28.0 | React DOM dependency |
| clsx | 2.1.1 | A small third-party package example |

Versions are fixed by the included lockfile. The compiler gets these files under
`/tmp/app/node_modules`; the response reports the versions used. An import policy
rejects other bare package names, Node built-ins, remote JS imports, and JS imports
outside the project. It is a demo policy, not a complete package-policy engine.

No npm install, package download, lifecycle script, user config file, or user Vite
plugin executes in the compiler. Vite configuration and PostCSS options are fixed.
The React example uses Vite's built-in TSX transform, without React Fast Refresh.

To add a package: install an exact version, add it and its runtime dependencies to
the preparation script's list, regenerate the compiler, and add an application
fixture that uses it. Packages requiring native binaries, subprocesses, threads,
or install-time generated files need further work. Arbitrary npm compatibility
is not demonstrated. Keep toolchain packages separate from app dependencies.

## Storage and revisions

| Data | Location | Lifetime |
| --- | --- | --- |
| Unsaved/failed edits | Browser localStorage | Until reset or browser data deletion |
| Compiler filesystem and WASM heap | Fresh child isolate | Disposable; never the source of truth |
| Successful source and output | R2 revision object | Until explicitly deleted |
| Prepared compiler and package snapshot | Worker modules | Versioned with platform deployment |

One R2 object per revision keeps the example short and gives immediate read-after-
write behavior. Revisions are JSON encoded as UTF-8 bytes. Each asset request
reads that object, so this is not an efficient
large-app asset layout. A platform should store assets individually by content
hash, cache them, keep a project-to-current-revision pointer, and define retention.
Do not depend on an isolate staying warm for project persistence.
Deletion removes the origin revision; already downloaded or cached public assets
can remain accessible. It is not a mechanism for revoking previously shared code.

## HTTP API

Every protected request uses `Authorization: Bearer <BUILD_TOKEN>`.

| Method and path | Authentication | Behavior |
| --- | --- | --- |
| GET `/` | Public | Editor |
| GET `/example` | Public | React source fixture |
| POST `/build` | Required | Build `{entry, files}` and save a revision |
| GET `/projects/<id>` | Required | Restore saved source |
| DELETE `/projects/<id>` | Required | Delete source/output; its preview then returns 404 |
| GET `/preview/<id>/<file>` | URL possession | Serve immutable output, including source maps |
| POST `/run/<id>` | Required | Execute a built `app.js` as a separate backend Worker |

A successful build returns `id`, `preview` (or null for a library), `output`,
`warnings`, `dependencies`, `viteVersion`, `rolldownVersion`, `runtime`, and `wasmMemoryBytes`.
`runtime` is recorded inside Vite's `buildStart` hook. `wasmMemoryBytes` is the
linear WASM heap size, not total isolate memory or a peak-memory measurement.

Errors use `errors: [{message, file?, line?, column?, frame?}]`. Lines are one-based
and columns are zero-based. Invalid requests return 400, authentication failures
401, compiler failures 422, and compiler-loading/storage failures 503.
Rolldown sometimes embeds locations in its rendered diagnostic; the adapter
extracts those and strips terminal color codes. TypeScript is transpiled, not
type-checked. Backend execution failures return 422 with an `error` string.

## Building and executing backend code

`npm run demo:backend` demonstrates this separately. The compiler returns an ES
module exposing `fetch`. The host passes that module to a new application Worker,
which gets only `GREETING`, an example text binding. It receives no build token,
source store, compiler heap, or incoming authorization header. Network access is
disabled. This example's frontend is a standalone client app; the editor does not
wire arbitrary frontend API requests to the backend runner.

A real platform can replace `GREETING` with narrowly scoped data/service bindings.
That permission decision belongs to the platform, not the generated code. Never
execute generated application modules in the platform host itself.

## Operating boundaries

The demo accepts at most 30 files, 100,000 characters per file, and 512,000 bytes
per request. It requests 30 seconds of compiler CPU and 1 second for application
execution, with zero child subrequests; account limits can be stricter. Every
build starts a fresh compiler, so there is no incremental compiler cache or warm
session assumption. Local workerd does not establish hosted CPU-limit behavior.

Production work still includes user/project authorization, per-user quotas,
rate limiting, billing, retention, operational telemetry, cancellation, larger
project limits, package-policy review, retries for transient storage errors,
and recovery from resource exhaustion.
The shared build token is demo access control. Runtime isolation and these tests
do not constitute a security audit. Keep source maps private if the product
promises private source; this demo's previews intentionally expose them.

HMR/dev server, arbitrary plugins, SSR frameworks, Tailwind, Sass, native CSS
minification, arbitrary npm installs, and large projects remain outside the
verified surface. Rebuild-and-reload is enough for this small example. Upgrading
those capabilities should come with new fixtures and hosted measurements.
