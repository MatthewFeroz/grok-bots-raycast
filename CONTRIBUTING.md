# Contributing

Use Node.js 24.11 or newer. The checks run on Linux and macOS; testing the native interface requires macOS and Raycast.

```sh
npm ci
npm run check
npm audit
```

Use temporary private directories and injected transports for sender tests. Automated tests must not call real Bots or require credentials. Do not attach raw config, webhook links/keys, private messages, desktop recordings or local delivery receipts to issues or pull requests. Public screenshots should show deliberately harmless example text only.

For a UI change, run `npm run dev` on a Mac and verify the affected keyboard path in Raycast. Explain the problem, resulting behavior and validation in your PR. Keep the fixed executable path, stdin message transport, metadata allowlist, journal-before-send behavior and duplicate protection intact.

The minimatch override keeps the Raycast CLI and TypeScript tooling on a version that fixes GHSA-g3hv-75wg-m249. Retain it until upstream dependency ranges include a fixed release; verify `npm audit` and `npm run check` when changing it.
