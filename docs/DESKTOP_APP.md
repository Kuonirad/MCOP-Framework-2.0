# MCOP Desktop

MCOP Desktop is the human product path for the framework: a Tauri 2 native
shell around the existing Next/React visual system. Installed users do not
need Node, pnpm, Python, Docker, or a terminal.

## Product surfaces

The frameless application opens a motion-glass shell with three primary views:

- **Field** — the existing `public/homepage/index.html` motion-glass surface.
- **Dialectical Studio** — the live deterministic triad at `/dialectical`.
- **Showcase** — the cinematic Three.js surface at `/showcase/index.html`.

Developer diagnostics stay behind the **Pro / Dev** drawer. The first-run flow
shows the OS application-data directory, keeps cloud connectors optional,
and can enter Dialectical Studio immediately for a network-free triad demo.

Deep links are registered by the installer:

```text
mcop://dialectical
mcop://showcase
```

## Runtime ownership

`pnpm desktop:prepare` (and Tauri `beforeBuildCommand`) runs **four** deterministic
steps that match the scripts in-tree:

1. **Build Next** with `output: "standalone"` (`pnpm build`).
2. **Stage the server tree** with
   [`scripts/desktop/stage-standalone.mjs`](../scripts/desktop/stage-standalone.mjs):
   copy `.next/standalone` + `public` + `.next/static`, flatten the pnpm virtual
   store for NSIS path limits, then **prune foreign optional native packages**
   (other OS/arch/ABI triples, including `@img/sharp-linuxmusl-*`) so Linux
   AppImage `linuxdeploy` never walks musl `.node` binaries on a glibc host.
3. **Prepare the Node sidecar** with
   [`scripts/desktop/prepare-node-runtime.mjs`](../scripts/desktop/prepare-node-runtime.mjs):
   download the official Node **22.23.1** archive for the Rust target via `curl`
   from `https://nodejs.org/dist/` only, verify the archive SHA-256 against a
   compile-time pin sourced from Node's published `SHASUMS256.txt`, and verify
   the extracted executable against its separate compile-time binary pin.
   Cached sidecars are re-hashed on every preparation; old archive-only (`v1`)
   manifests and modified executables are rejected. Install the binary as
   Tauri `binaries/node` plus legal notices.
4. **Bundle installers** via Tauri (`pnpm desktop:build` / CI matrix): NSIS + MSI
   on Windows, AppImage + deb on Linux, with the staged Next tree as
   `resources` and the pin-verified Node binary as `externalBin`.

At launch, Rust reserves an ephemeral loopback port, starts the private Node
sidecar with no terminal window (relative `server.js` under the staged server
root — absolute paths break when the Windows install directory contains
spaces), waits for the server socket, and navigates the frameless WebView to
`/desktop`. Closing the native window terminates the sidecar.

The loopback UI receives a deliberately narrow Tauri capability: minimize,
maximize, drag, and close the native window. It receives no shell, filesystem,
process, updater, or secret-storage permissions. This matters because the
cinematic showcase currently loads its Three.js prototype dependencies from a
CDN; those scripts must never inherit a privileged native bridge.

The installed runtime never reads the host `PATH` for Node or pnpm. Build hosts
may use Node `>=22.22.3 <25`; CI, containers, and the bundled runtime stay pinned
to 22.23.1.

The application identity is `ai.kullailabs.mcop`. The Windows bundle publisher
metadata is `KullAI Labs`, and the WiX upgrade code is fixed in the release
contract so an ordinary version upgrade keeps one MSI product lineage. This
metadata is not an Authenticode signature.

## Local verification

### 1. Packaging contracts (no Tauri toolchain)

```bash
pnpm install
pnpm desktop:test
```

`desktop:test` runs Node's built-in test runner over
`scripts/desktop/*.node-tests.mjs`. It covers Node archive and executable pins,
cached-sidecar tamper detection, foreign-native pruning (musl sharp must not
ship on glibc Linux), the Tauri identity/capability contract, release tag and
version alignment, flat release assets and checksum verification, basename
collision rejection, and the relative Node sidecar entrypoint (space-safe
Windows install paths).

### 2. Staged standalone server (web parity)

```bash
pnpm standalone:build
pnpm standalone:start
```

Convenience launchers expose equivalent modes:

```powershell
.\start-dev.ps1 -Mode standalone
```

```bash
./scripts/dev.sh standalone
```

### 3. Native installers (Tauri prerequisites required)

On a host with the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
pnpm desktop:build
```

`desktop:build` runs `desktop:prepare` (steps 1–3 above) then the Tauri bundler.

## Installer pipeline

`.github/workflows/desktop.yml` builds on native GitHub runners:

| Runner | Bundles |
| --- | --- |
| `windows-latest` | NSIS `.exe`, WiX `.msi` |
| `ubuntu-22.04` | AppImage, Debian `.deb` |

Pull requests and manual runs produce temporary Actions artifacts; those are
not public installer releases. A `desktop-v<version>` tag publishes a GitHub
Release only when the tag matches all four version declarations, the tagged
commit is contained in `main`, the pinned Rust 1.97.0 formatting/tests/clippy
and cargo-audit gates pass, and CI produces exactly one NSIS `.exe`, WiX
`.msi`, AppImage, and `.deb`.

Before publishing, CI flattens the four installers plus the Linux and Windows
SHA-256 manifests into one release-asset directory, rejects filename
collisions, verifies every checksum against that flat layout, and verifies
each installer's GitHub Sigstore build-provenance attestation. It stages those
six assets in a draft, confirms the draft contains exactly that set, then
publishes it. A rerun never clobbers assets or modifies an already-published
release.

GitHub Sigstore provenance authenticates the CI build; it is not Windows
Authenticode signing. The Windows installers are currently unsigned, and no
Tauri updater feed or updater signing key is published. macOS bundles and a
Python sidecar also remain out of scope.

## Rust dependency security

`apps/desktop/src-tauri` is built with Rust 1.97.0 and gated by
`cargo fmt --check`, `cargo test --locked`,
`cargo clippy --locked --all-targets -- -D warnings`, and
`cargo audit --deny warnings` in the Desktop Installers job.

| Class | Status |
| --- | --- |
| **urlpattern / unic-*** | **Fixed** — `Cargo.toml` patches `tauri-utils` to the post-`urlpattern 0.6` source so unmaintained `unic-*` crates leave the lockfile (icu_properties instead). Drop the git patch when crates.io ships that bump. |
| **gtk-rs 0.18 / glib 0.18 / proc-macro-error** | **Tracked, not removable today** — required by wry/tauri Linux WebView (`webkit2gtk`). No patched gtk3 crates exist; glib ≥ 0.20 needs gtk4. Explicit ignores live in [`.cargo/audit.toml`](../apps/desktop/src-tauri/.cargo/audit.toml) with upstream links (wry#1435, tauri#11928). |

```bash
cd apps/desktop/src-tauri && cargo audit --deny warnings
```
