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

The desktop build performs four deterministic steps:

1. Build Next with `output: "standalone"`.
2. Stage `.next/standalone`, `public`, and `.next/static` into one server tree.
3. Download the official Node 22.23.1 archive for the Rust target and verify it
   against Node's published `SHASUMS256.txt` digest list.
4. Bundle that Node executable as Tauri's `binaries/node` sidecar, alongside
   the staged Next server and upstream license material.

At launch, Rust reserves an ephemeral loopback port, starts the private Node
sidecar with no terminal window, waits for the server socket, and navigates the
frameless WebView to `/desktop`. Closing the native window terminates the
sidecar.

The loopback UI receives a deliberately narrow Tauri capability: minimize,
maximize, drag, and close the native window. It receives no shell, filesystem,
process, updater, or secret-storage permissions. This matters because the
cinematic showcase currently loads its Three.js prototype dependencies from a
CDN; those scripts must never inherit a privileged native bridge.

The installed runtime never reads the host `PATH` for Node or pnpm. Build hosts
may use Node `>=22.22.3 <25`; CI, containers, and the bundled runtime stay pinned
to 22.23.1.

## Local verification

Build and run the same staged server on Windows or Linux:

```bash
pnpm install
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

Build the native application on a host with the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
pnpm desktop:test
pnpm desktop:build
```

`desktop:build` automatically stages Next and prepares the verified sidecar.

## Installer pipeline

`.github/workflows/desktop.yml` builds on native GitHub runners:

| Runner | Bundles |
| --- | --- |
| `windows-latest` | NSIS `.exe`, WiX `.msi` |
| `ubuntu-22.04` | AppImage, Debian `.deb` |

Every run uploads workflow artifacts and SHA-256 checksum files. A
`desktop-v*` tag creates a draft GitHub Release and attaches both platform
sets. Tagged installers receive GitHub's Sigstore-backed build-provenance
attestation and can be checked with `gh attestation verify`.

Windows Authenticode, the Tauri updater signing key, macOS bundles, and the
Python sidecar remain explicit follow-ups; the MVP does not pretend they are
already active.
