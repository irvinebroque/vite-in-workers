# Vite in Workers

A small, working example of a **vibe-coding build service**: edit a React app,
run Vite 8.3.5 inside a fresh Dynamic Worker, and view the resulting app.

```text
Editor → host Worker → compiler Worker → Vite → HTML / JS / CSS
                ↓
         R2 source + output → sandboxed browser preview
```

The example is validated locally and on hosted Cloudflare Workers. It uses
Vite's documented build API through a **custom compatibility adapter and our own
single-threaded WASM build of upstream Rolldown 1.2.15**. This is not an upstream-supported
Vite execution environment. Read [COMPATIBILITY.md](COMPATIBILITY.md).

## Try the editor

Use Node **24.22.0**, pinned in `.node-version`. Install both packages; the separate `host/` package keeps
`cf` from treating the compiler's Vite dependency as a normal frontend project.

```sh
npm ci
npm ci --prefix host
npm run build:rolldown
cp -n host/.dev.vars.example host/.dev.vars
npm run dev
```

Open **http://localhost:8787**. Click **Build & preview**, change `title.ts` or
`style.css`, and build again. Click the app's task button to exercise React.
The editor fills in the local-only token `local-demo` automatically.

The one-time compiler build needs Git and [rustup](https://rustup.rs/). It installs
the pinned Rust toolchain, checks out the official Rolldown release, applies our
small adapter, and compiles WASM locally. See [toolchain/README.md](toolchain/README.md)
for the source changes, provenance checks, and upgrade procedure.

A syntax error produces a filename, line, and column while keeping the last
successful preview. Draft edits survive a page reload in browser localStorage.
Every successful build saves an immutable revision in R2 and returns a
shareable preview URL. This example rebuilds and reloads; it does not run HMR.

## The smallest examples

```sh
npm run demo          # two JS modules → an ES module exporting 42
npm run demo:backend  # compile code → execute it in a separate application Worker
```

Or call the running service:

```sh
curl http://localhost:8787/build \
  -H 'Authorization: Bearer local-demo' \
  -H 'Content-Type: application/json' \
  --data @example.json
```

To build the React example through HTTP, use `--data @prepared/example.json`.
That file contains source, not a precompiled application.

## Read the code

- [src/host.js](src/host.js): authenticate, create a compiler, persist results,
  and optionally execute a generated backend in a separate Worker.
- [src/build.js](src/build.js): write source into memory, call `vite.build()`,
  and return files, diagnostics, and runtime metadata.
- [src/preview.js](src/preview.js): serve saved artifacts with sandbox headers.
- [public/index.html](public/index.html): a plain HTML editor and preview iframe.
- [examples/react/](examples/react/): the complete editable app.
- [compat/](compat/), [scripts/prepare.js](scripts/prepare.js): the unusual parts
  needed to load Vite and Rolldown in Workers.
- [toolchain/](toolchain/): the reproducible compiler build and small Rust adapter.

Start with `host.js` and `build.js`. The host validates the request once, then the
compiler builds it. The compatibility code stays outside that main flow.

`prepare.js` runs on the developer's machine to package the **compiler** and copy
approved dependency source. It uses esbuild for that packaging. Submitted apps
are compiled later, by Vite and Rolldown inside the child Worker. The tests create
new source after packaging to check that distinction.
Generated package snapshots and the example file map are ordinary JSON imports
from `prepared/`; you do not need to edit them.

## Test

```sh
npm test                       # local Worker integration and persistence tests
npx playwright install chromium
npm run test:browser            # real Chromium; starts cf dev if needed
npm run test:all                # both
```

The browser test checks React interaction, CSS, editing, rebuilding, diagnostics,
draft persistence, and blocked access from the preview to the editor and network.
See [VALIDATION.md](VALIDATION.md) for measured results and tested boundaries.

## Deploy with cf

Choose a unique Worker and bucket name in `host/cloudflare.config.ts` if needed.
The deploy command provisions the R2 bucket. Build and source-management routes
require a secret; a deployment without one fails closed.

```sh
npm run token                  # creates a private, gitignored secrets file; refuses overwrite
npm run prepare:runtime
cd host
npx cf auth login
npx cf deploy --secrets-file ../work/hosted-secrets.json
```

Paste the generated token into the hosted editor. Never use `local-demo` as a
hosted secret. Preview URLs are intentionally readable without a token;
compiled output and source maps must be treated as public to anyone with the URL.

To run the same tests against a deployment, set `BUILD_URL` and `BUILD_TOKEN`
in your environment, then run `node scripts/verify.js` and `npm run test:browser`.
Do not put tokens in source control. [PLATFORM.md](PLATFORM.md) explains storage,
dependencies, API routes, permissions, and what a production platform still needs.

## Source and license

Original project code is [MIT licensed](LICENSE). [PROVENANCE.md](PROVENANCE.md)
maps the compatibility code to official upstream sources and APIs;
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) preserves upstream notices.
Raw test reports, screenshots, private deployment metadata, credentials, and
compiler build outputs are ignored by Git.
