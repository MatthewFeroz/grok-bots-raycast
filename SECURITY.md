# Security

Report suspected vulnerabilities privately through [GitHub's vulnerability reporting form](https://github.com/saphid/grok-bots-raycast/security/advisories/new). Do not open a public issue with credentials or private Bot messages. Include a minimal reproduction using synthetic data.

The extension invokes a local sender. The sender stores bearer credentials in owner-only files outside the checkout. It does not encrypt them or store them in the macOS Keychain. Anyone with access to your account or Node process can access those credentials. See the [sender contract](docs/sender.md) for transport, storage and delivery guarantees.

Never submit keys as messages or attach your private config/receipts to reports. If a real key is exposed, revoke or rotate it in the Bot routine immediately; deleting a file from Git does not remove it from history.

## Maintainer checks

Before publishing code or screenshots:

- Run `npm run check` and `npm audit`.
- Scan Git history and the intended publish tree with Gitleaks, with redacted output.
- Inspect public images for private content.

`.gitleaks.toml` extends the default rules and excludes only the exact public LocalStorage key `delivery-receipts-v1`. It does not exclude credential fields or whole source/test paths.
