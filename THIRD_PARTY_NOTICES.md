# Third-party notices

The project's original code is licensed under [MIT](LICENSE). That license does
not replace the licenses of its dependencies or upstream source excerpts.

- **Rolldown 1.2.15:** `toolchain/rolldown.patch` contains context from the official
  Rolldown source. Its MIT copyright and permission notice is retained in
  [LICENSES/Rolldown.txt](LICENSES/Rolldown.txt).
- **Vite 8.3.5:** the packaging adapter targets the official Vite distribution.
  Its core MIT notice is retained in [LICENSES/Vite.txt](LICENSES/Vite.txt).
- **Other dependencies:** npm and Cargo fetch them from their upstream
  distributions using the committed npm lockfiles and Rolldown's pinned Cargo
  lockfile. Each dependency retains its own license.

The repository excludes `node_modules/`, downloaded source checkouts, generated
JavaScript bundles, and WASM binaries. When distributing those generated artifacts,
retain the relevant dependency notices as well, including Vite's complete
`LICENSE.md` and Rolldown's `LICENSE` and `THIRD-PARTY-LICENSE`. These two notices
are not a complete license inventory for a binary redistribution.
