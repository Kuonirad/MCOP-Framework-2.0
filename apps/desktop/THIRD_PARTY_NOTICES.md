# MCOP Desktop third-party notices

MCOP Desktop is licensed under Apache-2.0. The installer also contains:

- **Node.js 22.23.1**, downloaded from the official Node.js distribution and
  verified against `SHASUMS256.txt` during the build. Its complete upstream
  `LICENSE` file is installed under the desktop application resources.
- The production dependency subset emitted by Next.js standalone output.
  Package license metadata remains available in the staged `node_modules`
  package manifests and in MCOP's release SBOM.

The bundled Node executable is a private implementation detail used only to
host MCOP's loopback Next server. Users do not need to install Node or pnpm.
